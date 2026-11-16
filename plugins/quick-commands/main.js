// Quick commands: a menu in each Claude terminal's pane header with the slash commands chosen in its settings
// (/compact, /clear, /context…). Otterm types a command only while Claude waits at its prompt with an empty input
// box, and presses Enter only once the box shows exactly that command; otherwise it says why, and nothing is typed.

/** Claude waits at its prompt. */
const IDLE = new Set(['ready', 'your-turn']);
/** Claude is running (the button shows, dimmed while it works). */
const UP = new Set(['ready', 'your-turn', 'working', 'background', 'approval']);
/** What Otterm will type: a slash command's name, then what follows it on the same line. */
const COMMAND = /^\/[a-z][\w-]{0,39}( .{1,200})?$/i;
/** At most this many in the menu. */
const MAX = 12;
/** Commands that drop or rewrite the conversation (/reset and /new are /clear's other names). */
const LOSES = new Set(['/clear', '/reset', '/new', '/compact']);
/** How long such a command waits for its second click. */
const ARMED_MS = 3000;

/**
 * The commands in the setting, in its order: separated by commas, each one checked, repeats left out.
 * @param {unknown} text
 * @returns {{ commands: string[], skipped: string[] }}
 */
export function parse(text) {
  /** @type {string[]} */
  const commands = [];
  /** @type {string[]} */
  const skipped = [];
  for (const part of String(text ?? '').split(/[,\n]/)) {
    const c = part.trim().replace(/ +/g, ' ');
    if (!c) continue;
    if (!COMMAND.test(c) || /\p{Cc}/u.test(c)) skipped.push(c);
    else if (!commands.includes(c) && commands.length < MAX) commands.push(c);
  }
  return { commands, skipped };
}

/**
 * Whether a command drops or rewrites the conversation, so it asks for a second click.
 * @param {string} cmd
 */
export function losesContext(cmd) {
  return LOSES.has(cmd.split(' ')[0].toLowerCase());
}

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const h = otterm.ui.h;
  /** The open menu: its element (on the page, so a pane doesn't cut it off), and the terminal it is for. */
  /** @type {{ node: HTMLElement, id: string } | null} */
  let menu = null;
  /** The command waiting for its second click. @type {string | null} */
  let armed = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let disarm;
  /** Terminals a command is on its way to. */
  const sending = new Set();

  const close = () => {
    clearTimeout(disarm);
    armed = null;
    if (!menu) return;
    menu.node.remove();
    menu = null;
    otterm.ui.redraw();
  };

  /**
   * @param {import('otterm-plugin').Terminal} t
   * @param {string} cmd
   */
  const send = async (t, cmd) => {
    close();
    sending.add(t.id);
    otterm.ui.redraw();
    try {
      await otterm.command(t.id, cmd);
      otterm.ui.toast(`${cmd} sent to ${t.name}`);
    } catch (e) {
      otterm.ui.toast(`${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sending.delete(t.id);
      otterm.ui.redraw();
    }
  };

  /**
   * @param {import('otterm-plugin').Terminal} t
   * @param {string} cmd
   */
  const pick = (t, cmd) => {
    if (otterm.config.get('confirm') !== false && losesContext(cmd) && armed !== cmd) {
      clearTimeout(disarm);
      armed = cmd;
      disarm = setTimeout(() => {
        armed = null;
        fill();
      }, ARMED_MS);
      fill();
      return;
    }
    void send(t, cmd);
  };

  /** The menu's items, for its terminal as it is now. */
  const fill = () => {
    if (!menu) return;
    const t = otterm.terminal(menu.id);
    if (!t || t.kind !== 'claude' || !t.alive || !UP.has(t.state)) {
      close();
      return;
    }
    const idle = IDLE.has(t.state) && !sending.has(t.id);
    const { commands, skipped } = parse(otterm.config.get('commands'));
    menu.node.replaceChildren(
      h('div', { class: 'qc-title' }, idle ? `Type into ${t.name}` : `${t.name} is busy: wait for its turn to end`),
      ...commands.map((cmd) =>
        h(
          'button',
          {
            type: 'button',
            class: `qc-item${armed === cmd ? ' qc-armed' : ''}`,
            role: 'menuitem',
            disabled: !idle,
            title: losesContext(cmd) && otterm.config.get('confirm') !== false ? `${cmd} can't be undone: click twice to send it.` : `Send ${cmd} to Claude.`,
            onclick: () => pick(t, cmd),
          },
          armed === cmd ? `Send ${cmd}?` : cmd,
        ),
      ),
      ...(commands.length ? [] : [h('div', { class: 'qc-note' }, 'No commands yet: add them in Settings → Extensions → Quick commands.')]),
      ...(skipped.length ? [h('div', { class: 'qc-note' }, `Left out, not slash commands: ${skipped.join(', ')}`)] : []),
    );
  };

  /**
   * @param {HTMLElement} anchor
   * @param {import('otterm-plugin').Terminal} t
   */
  const open = (anchor, t) => {
    // Measured first: closing another terminal's menu redraws the headers, this button with them.
    const r = anchor.getBoundingClientRect();
    const again = menu?.id === t.id;
    close();
    if (again) return;
    const node = h('div', { class: 'qc-menu', role: 'menu' });
    document.body.append(node);
    menu = { node, id: t.id };
    fill();
    // Under the button, kept inside the page.
    node.style.top = `${Math.round(r.bottom + 4)}px`;
    node.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - node.offsetWidth - 8)))}px`;
    otterm.ui.redraw();
  };

  // A click anywhere else closes the menu; Escape too, and then it doesn't reach the terminal.
  const onDown = (/** @type {PointerEvent} */ e) => {
    if (!menu) return;
    if (e.target instanceof Element && e.target.closest('.qc-menu, .qc-button')) return;
    close();
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (!menu || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', close);
  const offTerminals = otterm.on('terminals', fill);
  const offConfig = otterm.config.onChange(fill);
  const offLayout = otterm.on('layout', close);

  // On the right of the header, after the context figure (2) and the Compact button (2.5) when they show.
  otterm.ui.paneHeader({
    id: 'menu',
    order: 2.6,
    render: (t) => {
      if (t.kind !== 'claude' || !t.alive || !UP.has(t.state)) return null;
      const { commands } = parse(otterm.config.get('commands'));
      const busy = sending.has(t.id);
      return h(
        'button',
        {
          type: 'button',
          class: `qc-button${menu?.id === t.id ? ' qc-open' : ''}`,
          title: commands.length ? `Slash commands: ${commands.join(', ')}` : 'Slash commands: none set yet',
          'aria-label': 'Slash commands',
          'aria-haspopup': 'menu',
          'aria-expanded': String(menu?.id === t.id),
          onclick: (/** @type {MouseEvent} */ e) => {
            e.stopPropagation();
            if (e.currentTarget instanceof HTMLElement) open(e.currentTarget, t);
          },
        },
        busy ? '/…' : '/',
        h('span', { class: 'qc-caret' }, '▾'),
      );
    },
  });

  return () => {
    close();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', close);
    offTerminals();
    offConfig();
    offLayout();
  };
}
