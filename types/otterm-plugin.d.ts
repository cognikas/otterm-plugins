// The plugin API, version 1: what a plugin's activate(otterm) gets, and what Otterm promises plugins. This file is
// the contract. It stands alone (no imports), and is shipped as it is as otterm-plugin.d.ts: in New plugin…'s kit,
// and in cognikas/otterm-plugins, whose workflow type-checks every plugin against it. Otterm's own types must fit
// it (see the checks in plugins.ts), so the build fails if Otterm breaks a promise made here. Adding to it is fine;
// changing or removing anything needs a new API version. The design is in docs/extensions.md.

/** What kind of terminal: Claude Code, Codex, or a plain shell. */
export type TerminalKind = 'claude' | 'codex' | 'shell';

/** A terminal's state, as Otterm shows it. */
export type TerminalState =
  | 'starting'
  /** The agent asks whether to trust the folder. */
  | 'trust'
  /** Claude asks about development channels. */
  | 'channels'
  /** The agent asks whether to trust its hooks. */
  | 'hooks'
  | 'ready'
  | 'working'
  /** The turn ended, but the agent waits on its own background work. */
  | 'background'
  /** The agent asks for a permission. */
  | 'approval'
  | 'your-turn'
  /** A plain shell (no agent), open: Otterm shows it as Running, and idle. */
  | 'running'
  /** The agent ended; the shell is still there. */
  | 'ended'
  /** The shell exited. */
  | 'exited'
  /** Stopped in Otterm (Not running). */
  | 'stopped';

/** The optional parts of a pane's header; a part left out shows. */
export type HeaderFields = { readonly [F in 'model' | 'effort' | 'version' | 'session' | 'usage' | 'shell' | 'folder']?: boolean };

/** A terminal, as plugins see it. Read-only: change things through the API. */
export interface Terminal {
  readonly id: string;
  readonly name: string;
  /** The folder it runs in. */
  readonly folder: string;
  readonly kind: TerminalKind;
  /** Its group in the sidebar, or null. */
  readonly group: string | null;
  /** The shell's name: "PowerShell 7", "Git Bash". */
  readonly shellName: string;
  readonly state: TerminalState;
  /** Since when it is in that state (ms). */
  readonly stateSince: number;
  /** Its shell runs. */
  readonly alive: boolean;
  readonly exitCode: number | null;
  /** The agent's session ID, when known; changes after /clear. */
  readonly sessionId: string | null;
  /** The first line of the agent's last reply. */
  readonly lastMessage: string | null;
  readonly usage: {
    /** Percent of the context window in use. */
    readonly contextPct: number | null;
    /** The context window's size, in tokens. */
    readonly contextSize: number | null;
    /** The session's cost so far at list price (USD); back to 0 after /clear. */
    readonly costUsd: number | null;
    readonly tokensIn?: number | null;
    readonly tokensOut?: number | null;
    /** Its cost in the current 5-hour window (USD), across /clear and restarts. */
    readonly windowCostUsd?: number;
  };
  /** The agent's version, model ("Opus 5.5") and effort ("medium"), from its status line. */
  readonly claudeVersion?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  /** While the agent waits on its own background work: what it is, in a few words. */
  readonly backgroundWork?: string | null;
  /** A newer Claude Code is installed. */
  readonly updateReady?: boolean;
  /** What its pane header shows. */
  readonly view?: HeaderFields;
}

/** The Claude plan's usage. */
export interface PlanUsage {
  readonly fiveHourPct: number | null;
  /** In seconds, as Claude Code reports it. */
  readonly fiveHourResetsAt: number | null;
  readonly sevenDayPct: number | null;
  readonly sevenDayResetsAt: number | null;
  /** When it was last read (ms). */
  readonly updatedAt: number;
  /** Since when the terminals' windowCostUsd count (ms). */
  readonly splitSince?: number | null;
  /** The organization's name on Team and Enterprise, Max or Pro on personal plans. */
  readonly account?: string | null;
}

/** An entry of a Claude terminal's conversation. */
export type ChatItem =
  /** Something you typed. queued: sent while Claude was busy, and taken in mid-turn. */
  | { readonly kind: 'user'; readonly id: string; readonly at: number; readonly text: string; readonly queued?: boolean }
  /** Claude's words, in Markdown. */
  | { readonly kind: 'text'; readonly id: string; readonly at: number; readonly text: string }
  /** A tool Claude used: what it did, in a line or two, and what came back. */
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly at: number;
      /** The tool's own name, such as Bash or mcp__github__create_pr. */
      readonly name: string;
      /** What it did, in words: "Ran the tests", "Read", "Edit". */
      readonly title: string;
      /** The command, the file, the pattern. */
      readonly detail: string | null;
      readonly status: 'running' | 'done' | 'error';
      /** Some of what came back: the end of a command's output, an error. Never a file's contents. */
      readonly output: string | null;
      /** An edit's changed lines, each starting with "+", "-" or " " (or "@@" between parts). */
      readonly diff: readonly string[] | null;
    }
  /** A line between messages: compacted, interrupted, a background task ended. */
  | { readonly kind: 'note'; readonly id: string; readonly at: number; readonly text: string; readonly detail?: string | null };

/** The terminals' colors (CSS colors), for ui.terminalTheme. */
export interface TerminalTheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  selectionInactiveBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

/** Something a plugin shows, or null for nothing. */
export type Shown = Node | null;

/** A child for ui.h: an element, text, or nothing. */
export type Kid = Node | string | null | undefined | false;

/** What Otterm tells a plugin about, through on(). */
export type PluginEvent =
  /** A terminal was added, removed or changed (its state, name, usage). */
  | 'terminals'
  /** The Claude plan's usage changed. */
  | 'plan'
  /** Another terminal has the keyboard. */
  | 'focus'
  /** One of this plugin's settings changed. */
  | 'config'
  /** The page went to the phone layout or back. */
  | 'layout'
  /** Text was sent from the box under the page on a phone, to the terminal open there (focused()). */
  | 'sent';

/** A way to show a terminal other than the terminal itself (the chat view is one). */
export interface PaneView {
  id: string;
  /** In the terminal's header, beside >_. */
  label: string;
  /** Whether it is offered for this terminal. */
  applies(t: Terminal): boolean;
  /** Shows it in host, which fills the pane; called again when the pane is drawn anew. */
  mount(host: HTMLElement, t: Terminal): { update?(t: Terminal): void; unmount(): void };
}

/** A message for the chat view: the conversation as entries, from Claude Code's transcript. */
export interface ChatMessage {
  mode: 'reset' | 'append' | 'prepend';
  items: ChatItem[];
  more: boolean;
  note?: string | null;
}

export interface Otterm {
  /** The plugin API: 1. */
  readonly api: 1;
  /** Otterm's version. */
  readonly version: string;
  /** The window on the PC, or the page a paired phone or laptop opens. */
  readonly where: 'window' | 'remote';
  /** The remote page in its phone layout: a list, then one terminal full screen. */
  readonly phone: boolean;

  terminals(): Terminal[];
  terminal(id: string): Terminal | null;
  /** The Claude plan's usage (5-hour and weekly limits, the split by terminal), or null before Claude's first reply. */
  plan(): PlanUsage | null;
  /** The terminal with the keyboard, or null. */
  focused(): string | null;
  /** Calls fn when it happens; the function returned stops that. */
  on(event: PluginEvent, fn: () => void): () => void;
  /** Shows a terminal: its pane gets the keyboard, or on a phone it opens full screen. */
  show(id: string): void;
  /**
   * A terminal's context: the tokens in it, its share of the window, and whether it is past the warning set in
   * Settings (warnK thousand tokens; null when off).
   */
  context(t: Terminal): {
    tokens: number | null;
    percent: number | null;
    hot: boolean;
    warnK: number | null;
    /** As Otterm shows it: 42% or 84k, as chosen in Settings ('' when unknown). */
    text: string;
    /** Its color, a class Otterm styles: hot, warm, cool, or ''. */
    tone: string;
    /** What Otterm shows on hover: context, tokens so far, cost, version. */
    tip: string;
  };
  /** Numbers as Otterm writes them. Each works on its own too: const { percent } = otterm.format. */
  format: {
    /** 42% */
    percent: (n: number | null) => string;
    /** $0.125, $3.20; '' for nothing */
    money: (usd: number | null) => string;
    /** 840, 84k, 1.2M */
    tokens: (n: number) => string;
    /** A folder shortened to its last two parts: …\work\otterm */
    shortPath: (p: string) => string;
  };

  /** This plugin's settings, from its manifest: the value set in Settings, or its default. */
  config: {
    get<T = unknown>(key: string): T;
    onChange(fn: () => void): () => void;
  };
  /** A little storage of its own, kept on this device (a choice the user made, what was open). */
  store: {
    get<T = unknown>(key: string): T | null;
    set(key: string, value: unknown): void;
  };

  ui: {
    /** An item in the top bar, beside Otterm's chips. */
    topBar(item: { id: string; order?: number; render(): Shown }): void;
    /** A block at the bottom of the sidebar, under the terminals (not on a phone, which has no sidebar beside them). */
    sidebarBlock(item: { id: string; order?: number; render(): Shown }): void;
    /** Something in each pane's header: after its name and state (start), or on the right before its buttons (end, the default). */
    paneHeader(item: { id: string; order?: number; slot?: 'start' | 'end'; render(t: Terminal): Shown }): void;
    /** Something in each terminal's row in the sidebar. */
    sidebarRow(item: { id: string; order?: number; render(t: Terminal): Shown }): void;
    /** Another way to show a terminal, offered in its header. */
    paneView(view: PaneView): void;
    /** Shows a terminal in a view of this page ('terminal' for the terminal itself), as its header's switch would. */
    setView(id: string, view: string): void;
    /** The terminals' colors (a theme's). Undone when the plugin unloads. */
    terminalTheme(theme: TerminalTheme): void;
    /** Draw again what this plugin shows (after something only it knows changed). */
    redraw(): void;
    /** A short message at the bottom of the page. */
    toast(text: string): void;
    /**
     * An element: h('span', { class: 'x', title: 'y', onclick }, 'text', child). Text is always text, never HTML.
     * It works on its own too: const h = otterm.ui.h.
     */
    h: (tag: string, attrs?: Record<string, unknown> | null, ...kids: Kid[]) => HTMLElement;
    /** Markdown made into elements, as the chat view shows Claude's replies. */
    markdown(src: string): DocumentFragment;
    /** The terminal's state as Otterm shows it in the sidebar: a dot, or the face of a stopped one. */
    statusIcon(t: Terminal): HTMLElement;
    /** A group's color (a CSS color); a neutral one for no group. */
    groupColor(group: string | null): string;
  };

  /** Types text into a terminal, as a paste then Enter. Needs "type" in the manifest's permissions. */
  type(id: string, text: string): void;
  /** Sends keys to a terminal as they are (arrows, Enter, Esc). Needs "type". */
  keys(id: string, data: string): void;
  /**
   * Sends a slash command, such as /compact, to a Claude terminal the safe way: only while Claude waits at its prompt
   * (ready or your turn) with an empty input box, and Enter only once the box shows exactly that command. Otherwise it
   * rejects with the reason ("Claude is busy…", "Not sent: its input box has text you haven't sent…"), and nothing is
   * typed or queued. One line: a "/", the command's name, and what it takes. Needs "type".
   */
  command(id: string, text: string): Promise<void>;
  /** The bottom of a terminal's screen: its last lines (as many as it is tall by default, up to 200). Needs "screen". */
  screen(id: string, lines?: number): string[];
  /** Calls fn a moment after new output for a terminal is drawn on this page; the function returned stops it. Needs "screen". */
  watchScreen(id: string, fn: () => void): () => void;
  /** A Claude terminal's conversation, as it grows; the function returned stops it. Needs "chat". */
  chat(id: string, fn: (msg: ChatMessage) => void): () => void;
  /** Earlier entries of the conversation, which come as a prepend message. Needs "chat". */
  chatMore(id: string): void;
}

/** A plugin's module: activate is called when it loads, and what it returns when it unloads. */
export interface PluginModule {
  activate(otterm: Otterm): void | (() => void) | Promise<void | (() => void)>;
}
