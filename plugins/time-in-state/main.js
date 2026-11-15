// Time in state: how long each terminal has been waiting on you, or working, in its sidebar row and pane header.
// The times count up in place every 20 seconds, without redrawing anything else.

/** Claude, Codex or the shell waits on you. */
const WAITING = new Set(['approval', 'your-turn', 'trust', 'hooks', 'channels']);
/** The agent is busy. (A plain shell is 'running' the whole time it is open, so it never counts as busy.) */
const BUSY = new Set(['starting', 'working', 'background']);
const TICK_MS = 20_000;

/**
 * 42s is "<1m"; then 4m, 1h 05m, 2d 3h.
 * @param {number} ms
 */
export function howLong(ms) {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const h = otterm.ui.h;
  /** What each time on the page is for, so the tick can update it in place. @type {Map<HTMLElement, import('otterm-plugin').Terminal>} */
  const shown = new Map();

  /** @param {import('otterm-plugin').Terminal} t */
  const applies = (t) => {
    if (WAITING.has(t.state)) return true;
    const which = otterm.config.get('which');
    if (which === 'waiting') return false;
    if (BUSY.has(t.state)) return true;
    return which === 'all' && t.alive && t.state !== 'stopped';
  };

  /**
   * @param {HTMLElement} el
   * @param {import('otterm-plugin').Terminal} t
   */
  const paint = (el, t) => {
    const ms = Date.now() - t.stateSince;
    const waiting = WAITING.has(t.state);
    const longAfter = otterm.config.get('longAfter');
    el.textContent = howLong(ms);
    el.classList.toggle('time-in-state-long', waiting && typeof longAfter === 'number' && longAfter > 0 && ms >= longAfter * 60_000);
    el.title = `${waiting ? 'Waiting on you' : 'In this state'} for ${howLong(ms)}`;
  };

  /**
   * @param {import('otterm-plugin').Terminal} t
   * @param {'rows' | 'headers'} place
   */
  const render = (t, place) => {
    const where = otterm.config.get('where');
    if ((where !== 'both' && where !== place) || !applies(t)) return null;
    const el = h('span', { class: `time-in-state${WAITING.has(t.state) ? ' time-in-state-waiting' : ''}` });
    paint(el, t);
    shown.set(el, t);
    return el;
  };

  otterm.ui.sidebarRow({ id: 'time', render: (t) => render(t, 'rows') });
  // Right after the state, before what other plugins put at the start of the header.
  otterm.ui.paneHeader({ id: 'time', slot: 'start', order: -1, render: (t) => render(t, 'headers') });
  const stopConfig = otterm.config.onChange(() => otterm.ui.redraw());

  // A state change redraws the page with new elements; the tick updates the ones still there, and forgets the rest.
  const timer = setInterval(() => {
    for (const [el, t] of shown) {
      const now = el.isConnected ? otterm.terminal(t.id) : null;
      if (!now || now.state !== t.state || now.stateSince !== t.stateSince) shown.delete(el);
      else paint(el, now);
    }
  }, TICK_MS);

  return () => {
    clearInterval(timer);
    stopConfig();
    shown.clear();
  };
}
