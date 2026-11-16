// Spend: a chip in the top bar with what the terminals on this PC have cost, at list price: in the current 5-hour
// window, or their open sessions so far. A click lists each terminal's share, and a terminal in the list opens it.
// It reads each terminal's usage and the plan's window, and needs no permissions.

/**
 * Each terminal with what it cost, most first, and their sum, and what was added up (`by`). `window` is the current
 * 5-hour window (nothing once it has ended); `sessions` is each terminal's session so far, which is also what counts
 * when Claude Code gives no 5-hour window (signed in with an API key rather than a plan).
 * @param {readonly import('otterm-plugin').Terminal[]} terminals
 * @param {'window' | 'sessions'} what
 * @param {import('otterm-plugin').PlanUsage | null} plan
 * @param {number} now
 * @returns {{ by: 'window' | 'sessions', total: number, rows: { t: import('otterm-plugin').Terminal, usd: number }[] }}
 */
export function spend(terminals, what, plan, now) {
  const resets = plan?.fiveHourResetsAt ?? null;
  const by = what === 'window' && resets !== null ? 'window' : 'sessions';
  const ended = by === 'window' && resets !== null && resets * 1000 <= now;
  const rows = ended
    ? []
    : terminals
        .map((t) => ({ t, usd: (by === 'window' ? t.usage.windowCostUsd : t.usage.costUsd) ?? 0 }))
        .filter((r) => r.usd > 0)
        .sort((a, b) => b.usd - a.usd);
  return { by, total: rows.reduce((a, r) => a + r.usd, 0), rows };
}

/** @param {number} ms */
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const h = otterm.ui.h;
  const { money } = otterm.format;
  /** The open list, on the page under the chip. @type {HTMLElement | null} */
  let list = null;

  const what = () => (otterm.config.get('show') === 'sessions' ? 'sessions' : 'window');
  const figures = () => spend(otterm.terminals(), what(), otterm.plan(), Date.now());

  /**
   * What the figure counts, in words.
   * @param {'window' | 'sessions'} by
   */
  const scope = (by) => {
    if (by === 'sessions') return what() === 'window' ? 'The open sessions so far: Claude Code gives no 5-hour window' : 'The open sessions so far (each back to $0 after /clear)';
    const plan = otterm.plan();
    const ends = plan?.fiveHourResetsAt != null && plan.fiveHourResetsAt * 1000 > Date.now() ? `, until ${clock(plan.fiveHourResetsAt * 1000)}` : '';
    const since = plan?.splitSince ? ` (counted since ${clock(plan.splitSince)})` : '';
    return `This 5-hour window${ends}${since}`;
  };

  const close = () => {
    if (!list) return;
    list.remove();
    list = null;
    otterm.ui.redraw();
  };

  const fill = () => {
    if (!list) return;
    const { by, total, rows } = figures();
    const most = rows[0]?.usd ?? 0;
    list.replaceChildren(
      h('div', { class: 'spend-title' }, scope(by)),
      ...rows.map(({ t, usd }) =>
        h(
          'button',
          {
            type: 'button',
            class: 'spend-row',
            title: `${t.name}: ${money(usd)}, ${Math.round((usd / total) * 100)}% of ${money(total)}. Click to open it.`,
            onclick: () => {
              close();
              otterm.show(t.id);
            },
          },
          h('span', { class: 'spend-name' }, t.name),
          h('span', { class: 'spend-bar' }, h('span', { style: { width: `${(usd / most) * 100}%`, background: otterm.ui.groupColor(t.group) } })),
          h('span', { class: 'spend-usd' }, money(usd)),
        ),
      ),
      ...(rows.length ? [] : [h('div', { class: 'spend-note' }, 'Nothing spent yet.')]),
      h('div', { class: 'spend-note' }, 'At list price, by the terminals on this PC. Plan limits count every device.'),
    );
  };

  /** @param {HTMLElement} anchor */
  const open = (anchor) => {
    const r = anchor.getBoundingClientRect();
    if (list) {
      close();
      return;
    }
    const node = h('div', { class: 'spend-list', role: 'dialog', 'aria-label': 'Spend by terminal' });
    document.body.append(node);
    list = node;
    fill();
    node.style.top = `${Math.round(r.bottom + 6)}px`;
    node.style.left = `${Math.round(Math.max(8, Math.min(r.right - node.offsetWidth, innerWidth - node.offsetWidth - 8)))}px`;
    otterm.ui.redraw();
  };

  const onDown = (/** @type {PointerEvent} */ e) => {
    if (!list) return;
    if (e.target instanceof Element && e.target.closest('.spend-list, .spend-chip')) return;
    close();
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (!list || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', close);
  const offs = [otterm.on('terminals', fill), otterm.on('plan', fill), otterm.config.onChange(fill), otterm.on('layout', close)];
  // A window that ends shows $0 without waiting for the next change.
  const tick = setInterval(() => otterm.ui.redraw(), 60_000);

  otterm.ui.topBar({
    id: 'chip',
    render: () => {
      const { by, total } = figures();
      return h(
        'button',
        {
          type: 'button',
          class: `spend-chip${list ? ' spend-open' : ''}`,
          title: `${scope(by)}: ${money(total) || '$0'} at list price. Click for each terminal.`,
          onclick: (/** @type {MouseEvent} */ e) => {
            e.stopPropagation();
            if (e.currentTarget instanceof HTMLElement) open(e.currentTarget);
          },
        },
        money(total) || '$0',
        h('span', { class: 'spend-scope' }, by === 'window' ? '5h' : 'sessions'),
      );
    },
  });

  return () => {
    close();
    clearInterval(tick);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', close);
    for (const off of offs) off();
  };
}
