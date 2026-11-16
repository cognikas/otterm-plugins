// Auto-compact: a Claude terminal that waits at its prompt with its context past a mark gets /compact by itself,
// after a countdown shown in its pane header and sidebar row, each with a Cancel. It runs in Otterm's window on the
// PC only, so a phone with the page open doesn't count down too. Otterm types the command only into an empty input
// box, and presses Enter only once the box shows exactly /compact; otherwise it says why, and nothing is typed.

/** Claude waits at its prompt. */
const IDLE = new Set(['ready', 'your-turn']);

/**
 * Whether a terminal's context is past the mark: the context warning set in Settings → Display ('warning'), or a
 * share of the context window ('70' is 70%).
 * @param {{ percent: number | null, hot: boolean }} ctx
 * @param {unknown} at
 */
export function past(ctx, at) {
  if (at === 'warning') return ctx.hot;
  const mark = Number(at);
  return Number.isFinite(mark) && ctx.percent !== null && ctx.percent >= mark;
}

/**
 * The countdown's length in seconds, within 3 and 120 (10 when unset).
 * @param {unknown} v
 */
export function seconds(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(120, Math.max(3, n)) : 10;
}

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const h = otterm.ui.h;
  /**
   * Countdowns, by terminal. `key` is the wait it counts down in (the terminal and since when it waits), so a new
   * turn starts a new countdown and an old one is dropped.
   * @type {Map<string, { key: string, at: number, timer: ReturnType<typeof setTimeout> }>}
   */
  const counting = new Map();
  /** Waits already dealt with (sent, cancelled or refused): never counted down again. */
  const done = new Set();
  /** Terminals sent /compact: not again until their context reads under the mark. */
  const cooling = new Set();
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticker;

  /** @param {import('otterm-plugin').Terminal} t */
  const keyOf = (t) => `${t.id}@${t.stateSince}`;
  /** @param {import('otterm-plugin').Terminal} t */
  const isPast = (t) => past(otterm.context(t), otterm.config.get('at'));

  const tick = () => {
    if (counting.size && !ticker) ticker = setInterval(() => otterm.ui.redraw(), 1000);
    if (!counting.size && ticker) {
      clearInterval(ticker);
      ticker = undefined;
    }
    otterm.ui.redraw();
  };

  /** @param {string} id */
  const stop = (id) => {
    const c = counting.get(id);
    if (!c) return;
    clearTimeout(c.timer);
    counting.delete(id);
  };

  /** @param {string} id */
  const fire = async (id) => {
    const c = counting.get(id);
    stop(id);
    tick();
    const t = otterm.terminal(id);
    if (!c || !t || keyOf(t) !== c.key || !IDLE.has(t.state) || !isPast(t)) return;
    done.add(c.key);
    const pct = otterm.context(t).text;
    try {
      await otterm.command(id, '/compact');
      cooling.add(id);
      otterm.ui.toast(`Compacting ${t.name}${pct ? ` (context ${pct})` : ''}`);
    } catch (e) {
      otterm.ui.toast(`${t.name}: auto-compact didn't send /compact. ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** @param {string} id */
  const cancel = (id) => {
    const c = counting.get(id);
    if (c) done.add(c.key);
    stop(id);
    tick();
  };

  const check = () => {
    let changed = false;
    for (const t of otterm.terminals()) {
      const due = t.kind === 'claude' && t.alive && IDLE.has(t.state) && isPast(t);
      if (!isPast(t)) cooling.delete(t.id);
      const c = counting.get(t.id);
      // Claude started working, the wait is another one, or the context went down: drop it quietly.
      if (c && (!due || c.key !== keyOf(t))) {
        stop(t.id);
        changed = true;
      }
      if (!due || cooling.has(t.id) || done.has(keyOf(t)) || counting.has(t.id)) continue;
      const wait = seconds(otterm.config.get('seconds'));
      counting.set(t.id, { key: keyOf(t), at: Date.now() + wait * 1000, timer: setTimeout(() => void fire(t.id), wait * 1000) });
      otterm.ui.toast(`Auto-compact: ${t.name} gets /compact in ${wait} s. Cancel in its header or sidebar row.`);
      changed = true;
    }
    for (const id of [...counting.keys()]) {
      if (!otterm.terminal(id)) {
        stop(id);
        changed = true;
      }
    }
    if (changed) tick();
  };

  /** @param {import('otterm-plugin').Terminal} t */
  const left = (t) => {
    const c = counting.get(t.id);
    return c ? Math.max(0, Math.ceil((c.at - Date.now()) / 1000)) : null;
  };

  /**
   * The countdown with its Cancel, for a pane header or a sidebar row.
   * @param {import('otterm-plugin').Terminal} t
   * @param {boolean} short
   */
  const countdown = (t, short) => {
    const s = left(t);
    if (s === null) return null;
    return h(
      'span',
      { class: `ac-count${short ? ' ac-short' : ''}`, title: `Auto-compact sends /compact to ${t.name} in ${s} s, as its context is past the mark.` },
      // The sidebar is narrow: just the seconds there, so the terminal's name keeps its room.
      short ? `${s}s` : `/compact in ${s} s`,
      h(
        'button',
        {
          type: 'button',
          class: 'ac-cancel',
          title: 'Not this time: it asks again after Claude’s next turn.',
          'aria-label': `Cancel auto-compact of ${t.name}`,
          onclick: (/** @type {MouseEvent} */ e) => {
            e.stopPropagation();
            cancel(t.id);
          },
        },
        short ? '×' : 'Cancel',
      ),
    );
  };

  otterm.ui.paneHeader({ id: 'countdown', order: 2.4, render: (t) => countdown(t, false) });
  otterm.ui.sidebarRow({ id: 'countdown', order: 5, render: (t) => countdown(t, true) });

  const offTerminals = otterm.on('terminals', check);
  const offConfig = otterm.config.onChange(() => {
    for (const id of [...counting.keys()]) stop(id);
    tick();
    check();
  });
  check();

  return () => {
    offTerminals();
    offConfig();
    for (const id of [...counting.keys()]) stop(id);
    clearInterval(ticker);
  };
}
