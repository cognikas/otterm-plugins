// Compact: a button in each Claude terminal's pane header that sends /compact, colored by how full its context is
// (issue #10). Otterm types the command only while Claude waits at its prompt with an empty input box, and presses
// Enter only once the box shows exactly /compact; otherwise it says why, and nothing is typed.

/** Claude waits at its prompt. */
const IDLE = new Set(['ready', 'your-turn']);
/** Claude is running (the button shows, dimmed while it works). */
const UP = new Set(['ready', 'your-turn', 'working', 'background', 'approval']);
/** How long the button waits for the second click. */
const ARMED_MS = 3000;

/**
 * The color for how full the context is: green up to 20%, yellow to 50%, orange to 75%, red above; none unknown.
 * @param {number | null} pct
 */
export function band(pct) {
  if (pct === null || !Number.isFinite(pct)) return 'none';
  if (pct <= 20) return 'green';
  if (pct <= 50) return 'yellow';
  if (pct <= 75) return 'orange';
  return 'red';
}

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const h = otterm.ui.h;
  /** The terminal whose button waits for its second click. @type {string | null} */
  let armed = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let disarm;
  /** Terminals the command is on its way to. */
  const sending = new Set();

  const unarm = () => {
    clearTimeout(disarm);
    armed = null;
  };

  /** @param {import('otterm-plugin').Terminal} t */
  const press = async (t) => {
    if (otterm.config.get('confirm') !== false && armed !== t.id) {
      unarm();
      armed = t.id;
      disarm = setTimeout(() => {
        armed = null;
        otterm.ui.redraw();
      }, ARMED_MS);
      otterm.ui.redraw();
      return;
    }
    unarm();
    sending.add(t.id);
    otterm.ui.redraw();
    try {
      await otterm.command(t.id, '/compact');
      otterm.ui.toast(`Compacting ${t.name}`);
    } catch (e) {
      otterm.ui.toast(`${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sending.delete(t.id);
      otterm.ui.redraw();
    }
  };

  // Right after the context figure (Pane details puts it at 2), which its color is about.
  otterm.ui.paneHeader({
    id: 'compact',
    order: 2.5,
    render: (t) => {
      if (t.kind !== 'claude' || !t.alive || !UP.has(t.state)) return null;
      const ctx = otterm.context(t);
      const idle = IDLE.has(t.state);
      const isArmed = armed === t.id;
      const busy = sending.has(t.id);
      const known = ctx.percent === null ? '' : ` Context ${otterm.format.percent(ctx.percent)}.`;
      return h(
        'button',
        {
          type: 'button',
          class: `compact-button compact-${band(ctx.percent)}${isArmed ? ' compact-armed' : ''}`,
          disabled: !idle || busy,
          title: idle ? `Send /compact to Claude.${known}${isArmed ? ' Click again to send it.' : ''}` : `Claude is busy: compact when its turn ends.${known}`,
          'aria-label': isArmed ? 'Compact: click again to send /compact' : 'Compact',
          onclick: (/** @type {MouseEvent} */ e) => {
            e.stopPropagation();
            void press(t);
          },
        },
        busy ? 'Compacting…' : isArmed ? 'Compact?' : 'Compact',
      );
    },
  });

  return () => unarm();
}
