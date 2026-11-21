// Otter pet: an otter that floats over the window. Drag it anywhere and it stays there. Its face shows how the
// terminals are doing (working, waiting on you, asleep when nothing works), a bubble says what Claude finished in the
// terminals you aren't looking at, and a click opens the terminal it's talking about.
//
// Plugin API 1 has no floating layer yet (cognikas/otterm#19), so it adds its own element to the page and takes it
// away when it unloads. Its voice (chimera) comes in 1.1, once Otterm lets a plugin load its wasm in a worker.

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Claude or Codex asks you something. */
const NEEDS = new Set(['approval', 'trust', 'hooks', 'channels']);
/** The agent is busy. */
const BUSY = new Set(['starting', 'working']);
/** The turn is over: your turn, or the agent waits on its own background work (a dev server, a subagent). */
const ENDED = new Set(['your-turn', 'background']);
/** @type {Record<string, string>} */
const ASKS = {
  approval: 'asks for your permission',
  trust: 'asks to trust its folder',
  hooks: 'asks to trust its hooks',
  channels: 'asks about development channels',
};
/** @type {Record<string, number>} */
const SIZES = { small: 72, medium: 96, large: 128 };
const MARGIN = 12;
/** Movement that makes a press a drag, not a click (px). */
const DRAG_PX = 5;
/** How fast the bubble shows the words: about the pace of speech. */
const WORDS_PER_SECOND = 2.5;
const HAPPY_MS = 6000;
/** Notices in the last reply that aren't Claude's answer: the otter keeps quiet about them. */
const NOT_AN_ANSWER =
  /^(you['’]ve (hit|reached) your|claude (ai )?usage limit|credit balance is too low|api error|request timed out|\[?request interrupted|interrupted by user|session limit reached)/i;
export const MAX_WORDS = 20;

/**
 * The first line of prose: skips code blocks, tables, rules and blank lines, and drops heading and list markers.
 * @param {string | null | undefined} text
 */
export function firstProseLine(text) {
  let inFence = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    if (line.startsWith('|') || /^[-*_=]{3,}$/.test(line) || line.startsWith('<')) continue;
    const prose = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^([-*+]|\d+[.)])\s+/, '')
      .replace(/^>\s*/, '');
    if (/\p{L}/u.test(prose)) return prose;
  }
  return '';
}

/**
 * A code span as a word: `src/daemon/usage.ts:520` is "usage"; `npm run test` stays; a commit hash says nothing.
 * @param {string} code
 */
function codeWord(code) {
  const c = code.trim();
  if (/\s/.test(c)) return c;
  if (/[\\/]/.test(c) || /\.[a-z]{1,5}(:\d+)?$/i.test(c)) {
    const last = c.split(/[\\/]/).filter(Boolean).pop() ?? '';
    return last.replace(/:\d+(-\d+)?$/, '').replace(/\.[a-z0-9]{1,5}$/i, '');
  }
  if (/^[0-9a-f]{7,40}$/i.test(c)) return '';
  return c;
}

/**
 * Inline markdown and symbols out, paths cut to a file's name, asides in parentheses dropped.
 * @param {string} line
 */
export function plainSpeech(line) {
  return line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/`([^`]+)`/g, (_, /** @type {string} */ code) => codeWord(code))
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/\s*[→⇒➜·]\s*/g, ', ')
    .replace(/[«»“”"]/g, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/[|<>#^{}[\]\\]/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.;:\s]+/, '')
    .trim();
}

/**
 * The first sentence (or two, when the first is very short), at most MAX_WORDS words.
 * @param {string} text
 */
export function firstSentence(text) {
  const sentences = text.split(/(?<=[.!?…])\s+(?=[\p{Lu}¿¡0-9])/u);
  let out = '';
  for (const s of sentences) {
    out = out ? `${out} ${s}` : s;
    if (out.split(/\s+/).length >= 5) break;
  }
  const words = out.split(/\s+/);
  if (words.length > MAX_WORDS) {
    let cut = words.slice(0, MAX_WORDS).join(' ');
    const comma = cut.lastIndexOf(',');
    if (comma > 0 && cut.slice(0, comma).split(/\s+/).length >= 10) cut = cut.slice(0, comma);
    out = cut;
  }
  out = out.replace(/[,;:\s]+$/, '');
  return /[.!?…]$/.test(out) ? out : `${out}.`;
}

/**
 * What the otter says about one of Claude's replies, or '' when there's nothing worth saying.
 * @param {string | null | undefined} message
 */
export function speakable(message) {
  const text = String(message ?? '').trim();
  if (!text || NOT_AN_ANSWER.test(text)) return '';
  const line = plainSpeech(firstProseLine(text));
  return line ? firstSentence(line) : '';
}

/**
 * The otter's face for a line: a failure looks sad, anything else happy.
 * @param {string} line
 * @returns {'sad' | 'happy'}
 */
export function moodFor(line) {
  return /\b(fail(ed|s|ing)?|error|errors|broke|broken|couldn'?t|can'?t|no pude|falló|fallan?|fallaron|rompió|no se puede)\b/i.test(line) ? 'sad' : 'happy';
}

/**
 * Whether a time of day is inside quiet hours written as "22:00-08:00" (a span past midnight works).
 * @param {unknown} spec
 * @param {Date} now
 */
export function inQuietHours(spec, now) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(typeof spec === 'string' ? spec : '');
  if (!m) return false;
  const from = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const to = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (from > 24 * 60 || to > 24 * 60 || from === to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * An SVG element; attributes as strings, children appended.
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {...SVGElement} kids
 * @returns {SVGElement}
 */
function svg(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const kid of kids) node.append(kid);
  return node;
}

/** The otter, from the spike: holding a stone, with faces for each mood. */
function drawOtter() {
  const eye = (/** @type {number} */ x) =>
    svg('g', { class: 'otter-pet-eye', transform: `translate(${x} 106)` }, svg('circle', { r: 9, fill: '#1d1410' }), svg('circle', { cx: 3, cy: -3, r: 3, fill: '#fff' }));
  const stroke = { fill: 'none', stroke: '#1d1410', 'stroke-width': 4.5, 'stroke-linecap': 'round' };
  const brow = { stroke: '#1d1410', 'stroke-width': 4, 'stroke-linecap': 'round' };
  const z = (/** @type {number} */ i) => {
    const t = svg('text', { class: `otter-pet-z otter-pet-z${i}`, x: 176 + i * 12, y: 64 - i * 14 });
    t.textContent = 'z';
    return t;
  };
  return svg(
    'svg',
    { class: 'otter-pet-otter', viewBox: '0 0 240 260', 'aria-hidden': 'true' },
    svg(
      'g',
      { class: 'otter-pet-body' },
      svg('ellipse', { cx: 120, cy: 212, rx: 74, ry: 46, class: 'otter-pet-fur' }),
      svg('ellipse', { cx: 120, cy: 218, rx: 48, ry: 34, class: 'otter-pet-belly' }),
      svg('circle', { cx: 62, cy: 58, r: 15, class: 'otter-pet-fur' }),
      svg('circle', { cx: 62, cy: 58, r: 8, class: 'otter-pet-fur-dark' }),
      svg('circle', { cx: 178, cy: 58, r: 15, class: 'otter-pet-fur' }),
      svg('circle', { cx: 178, cy: 58, r: 8, class: 'otter-pet-fur-dark' }),
      svg('circle', { cx: 120, cy: 108, r: 70, class: 'otter-pet-fur' }),
      svg('ellipse', { cx: 120, cy: 140, rx: 50, ry: 36, class: 'otter-pet-muzzle' }),
      svg('ellipse', { class: 'otter-pet-cheek', cx: 78, cy: 138, rx: 11, ry: 7 }),
      svg('ellipse', { class: 'otter-pet-cheek', cx: 162, cy: 138, rx: 11, ry: 7 }),
      svg('g', { class: 'otter-pet-eyes-open' }, eye(92), eye(148)),
      svg('g', { class: 'otter-pet-eyes-happy', ...stroke }, svg('path', { d: 'M82 109 q10 -12 20 0' }), svg('path', { d: 'M138 109 q10 -12 20 0' })),
      svg('g', { class: 'otter-pet-eyes-closed', ...stroke }, svg('path', { d: 'M82 106 q10 8 20 0' }), svg('path', { d: 'M138 106 q10 8 20 0' })),
      svg('g', { class: 'otter-pet-brows-sad', ...brow }, svg('path', { d: 'M80 93 l20 -6' }), svg('path', { d: 'M160 93 l-20 -6' })),
      svg('g', { class: 'otter-pet-brows-worried', ...brow }, svg('path', { d: 'M81 86 l19 -10' }), svg('path', { d: 'M159 86 l-19 -10' })),
      svg('path', { d: 'M107 124 q13 -6 26 0 q-3 11 -13 13 q-10 -2 -13 -13z', fill: '#2a1a12' }),
      svg('path', { class: 'otter-pet-smile', d: 'M104 146 q8 8 16 0 q8 8 16 0', fill: 'none', stroke: '#2a1a12', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      svg('ellipse', { class: 'otter-pet-mouth', cx: 120, cy: 152, rx: 10, ry: 7, fill: '#4a1f1a' }),
      svg(
        'g',
        { class: 'otter-pet-whiskers', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 },
        svg('path', { d: 'M84 134 l-30 -6' }),
        svg('path', { d: 'M84 141 l-30 2' }),
        svg('path', { d: 'M156 134 l30 -6' }),
        svg('path', { d: 'M156 141 l30 2' }),
      ),
      svg('ellipse', { cx: 120, cy: 196, rx: 20, ry: 14, class: 'otter-pet-stone' }),
      svg('ellipse', { class: 'otter-pet-paw otter-pet-paw-l', cx: 98, cy: 194, rx: 13, ry: 10 }),
      svg('ellipse', { class: 'otter-pet-paw otter-pet-paw-r', cx: 142, cy: 194, rx: 13, ry: 10 }),
    ),
    z(0),
    z(1),
    z(2),
  );
}

/**
 * @typedef {{ id: string, name: string, group: string | null, line: string, mood: 'sad' | 'happy' | 'worried',
 *   needs: boolean, state: string, stateSince: number, msg: string | null }} Said
 */

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  if (otterm.where === 'remote' && otterm.config.get('phone') === false) return;
  const h = otterm.ui.h;

  const otter = drawOtter();
  const who = h('span', { class: 'otter-pet-who' });
  const words = h('span', { class: 'otter-pet-words' });
  const close = h('button', { class: 'otter-pet-close', type: 'button', title: 'Dismiss', 'aria-label': 'Dismiss' }, '×');
  const bubble = h('div', { class: 'otter-pet-bubble', role: 'status', 'aria-live': 'polite', hidden: true }, close, who, words);
  const root = h(
    'div',
    { class: 'otter-pet', role: 'button', tabindex: '0', 'data-mood': 'neutral', 'data-activity': 'idle', 'data-talking': 'false' },
    bubble,
    otter,
  );
  document.body.append(root);

  // ---- Where it is: kept per device as a share of the room it has, so it stays put when the window is resized.

  const kept = /** @type {{ fx?: unknown, fy?: unknown } | null} */ (otterm.store.get('at'));
  /** Bottom right until it's moved. @type {{ fx: number, fy: number }} */
  let at = typeof kept?.fx === 'number' && typeof kept.fy === 'number' ? { fx: kept.fx, fy: kept.fy } : { fx: 1, fy: 1 };
  const size = () => {
    const s = otterm.config.get('size');
    const px = SIZES[typeof s === 'string' ? s : ''] ?? SIZES.medium;
    return otterm.phone ? Math.round(px * 0.75) : px;
  };
  const room = () => ({ w: Math.max(0, window.innerWidth - size() - 2 * MARGIN), h: Math.max(0, window.innerHeight - size() - 2 * MARGIN) });
  const place = () => {
    const s = size();
    const r = room();
    root.style.setProperty('--otter-pet-size', `${s}px`);
    const left = MARGIN + Math.min(1, Math.max(0, at.fx)) * r.w;
    const top = MARGIN + Math.min(1, Math.max(0, at.fy)) * r.h;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    // The bubble opens where there's room: below when the otter is near the top, leaning in from the sides.
    root.classList.toggle('otter-pet-below', top < 170);
    root.classList.toggle('otter-pet-lean-left', left + s / 2 > window.innerWidth - 150);
    root.classList.toggle('otter-pet-lean-right', left + s / 2 < 150);
  };
  place();
  window.addEventListener('resize', place);

  /** @type {{ x: number, y: number, left: number, top: number, pointer: number, moved: boolean } | null} */
  let press = null;
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (e.button !== 0 || e.target === close) return;
    press = { x: e.clientX, y: e.clientY, left: root.offsetLeft, top: root.offsetTop, pointer: e.pointerId, moved: false };
    root.setPointerCapture(e.pointerId);
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (!press || e.pointerId !== press.pointer) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!press.moved) root.classList.add('otter-pet-dragging');
    press.moved = true;
    const r = room();
    at = { fx: r.w ? (press.left + dx - MARGIN) / r.w : 1, fy: r.h ? (press.top + dy - MARGIN) / r.h : 1 };
    place();
  };
  /** @param {PointerEvent} e */
  const onUp = (e) => {
    if (!press || e.pointerId !== press.pointer) return;
    const dragged = press.moved;
    press = null;
    root.classList.remove('otter-pet-dragging');
    if (dragged) {
      at = { fx: Math.min(1, Math.max(0, at.fx)), fy: Math.min(1, Math.max(0, at.fy)) };
      otterm.store.set('at', at);
    } else if (e.target !== close) {
      openSubject();
    }
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSubject();
    } else if (e.key === 'Escape') {
      skip();
    }
  });
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    skip();
  });

  // ---- What the terminals are doing: the otter's activity, and the lines it has to say.

  const agents = () => otterm.terminals().filter((t) => t.kind !== 'shell');
  /** Each agent's last state seen, to tell a finish or a question from any other change. @type {Map<string, string>} */
  const seen = new Map(agents().map((t) => [t.id, t.state]));
  /** The reply each terminal was last told about, so background work ending later doesn't say it again. @type {Map<string, string | null>} */
  const told = new Map(agents().map((t) => [t.id, t.lastMessage]));
  let lastBusy = agents().some((t) => BUSY.has(t.state)) ? Date.now() : Math.max(0, ...agents().map((t) => t.stateSince));
  /** Lines waiting their turn: a question before a finish, one per terminal. @type {Said[]} */
  let queue = [];
  /** @type {Said | null} */
  let current = null;
  let mood = /** @type {'neutral' | 'sad' | 'happy' | 'worried'} */ ('neutral');
  let moodUntil = 0;

  /** @param {import('otterm-plugin').Terminal} t */
  const lookedAt = (t) => otterm.config.get('which') !== 'all' && otterm.focused() === t.id && document.hasFocus() && !document.hidden;

  /** @param {Said} s */
  const stillTrue = (s) => {
    const t = otterm.terminal(s.id);
    if (!t || lookedAt(t)) return false;
    // A question holds while it's asked; a finish while the terminal rests on that reply (your turn, or its own
    // background work).
    return s.needs ? t.state === s.state && t.stateSince === s.stateSince : ENDED.has(t.state) && t.lastMessage === s.msg;
  };

  const activity = () => {
    const list = agents();
    if (list.some((t) => NEEDS.has(t.state))) return 'needs';
    if (list.some((t) => BUSY.has(t.state))) return 'busy';
    if (list.some((t) => t.state === 'background')) return 'waiting';
    const after = otterm.config.get('sleepAfter');
    if (typeof after === 'number' && after > 0 && Date.now() - lastBusy >= after * 60_000) return 'asleep';
    return 'idle';
  };

  const paint = () => {
    const act = activity();
    const face = Date.now() < moodUntil ? mood : act === 'needs' ? 'worried' : 'neutral';
    root.dataset.activity = act;
    root.dataset.mood = face;
    const list = agents();
    const count = (/** @type {(t: import('otterm-plugin').Terminal) => boolean} */ f) => list.filter(f).length;
    const parts = [
      [count((t) => NEEDS.has(t.state)), 'need you'],
      [count((t) => BUSY.has(t.state)), 'working'],
      [count((t) => t.state === 'background'), 'waiting on their own work'],
      [count((t) => t.state === 'your-turn'), 'your turn'],
    ]
      .filter(([n]) => Number(n) > 0)
      .map(([n, what]) => `${n} ${what}`);
    root.title = `${parts.length ? parts.join(' · ') : act === 'asleep' ? 'Asleep: nothing has worked for a while' : 'All quiet'}\nClick to open the terminal it's talking about; drag to move it.`;
    root.setAttribute('aria-label', `Otter pet. ${parts.join(', ') || 'All quiet'}.`);
  };

  /** @type {ReturnType<typeof setTimeout> | null} */
  let showTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let wordTimer = null;

  const stopTalking = () => {
    if (wordTimer) clearInterval(wordTimer);
    wordTimer = null;
    root.dataset.talking = 'false';
  };

  const hideBubble = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    stopTalking();
    bubble.hidden = true;
    current = null;
  };

  /** Shows the next line that's still true, if any, unless quiet hours are on. */
  const next = () => {
    hideBubble();
    if (inQuietHours(otterm.config.get('quiet'), new Date())) queue = [];
    queue = queue.filter(stillTrue);
    const s = queue.shift();
    if (!s) return paint();
    current = s;
    mood = s.mood;
    moodUntil = Date.now() + HAPPY_MS;
    who.replaceChildren(h('span', { class: 'otter-pet-dot', style: { background: otterm.ui.groupColor(s.group) } }), s.name);
    words.replaceChildren();
    bubble.hidden = false;
    const list = s.line.split(/\s+/).filter(Boolean);
    const spans = list.map((w) => h('span', { class: 'otter-pet-word' }, `${w} `));
    words.append(...spans);
    // The words light up at about the pace of speech while the mouth moves; the voice joins in 1.1.
    let i = 0;
    root.dataset.talking = 'true';
    wordTimer = setInterval(() => {
      spans[i - 1]?.classList.remove('otter-pet-on');
      if (i >= spans.length) return stopTalking();
      spans[i]?.classList.add('otter-pet-on', 'otter-pet-said');
      i += 1;
    }, 1000 / WORDS_PER_SECOND);
    const least = otterm.config.get('bubbleSeconds');
    const ms = Math.max((typeof least === 'number' && least > 0 ? least : 8) * 1000, (list.length / WORDS_PER_SECOND) * 1000 + 2500);
    showTimer = setTimeout(next, ms);
    paint();
  };

  const skip = () => {
    hideBubble();
    next();
  };

  /** @param {Said} s */
  const say = (s) => {
    queue = queue.filter((q) => q.id !== s.id);
    if (current?.id === s.id) hideBubble();
    // A question goes before every finish; within each kind, first come first said.
    const before = s.needs ? queue.findIndex((q) => !q.needs) : -1;
    if (before < 0) queue.push(s);
    else queue.splice(before, 0, s);
    if (!current) next();
  };

  /** The terminal it's talking about, else the first that needs you, else the one that finished last. */
  const openSubject = () => {
    const list = agents();
    const pick =
      (current && otterm.terminal(current.id)) ??
      list.find((t) => NEEDS.has(t.state)) ??
      list.filter((t) => t.state === 'your-turn').sort((a, b) => b.stateSince - a.stateSince)[0] ??
      null;
    if (pick) {
      otterm.show(pick.id);
      if (current?.id === pick.id) skip();
    } else {
      root.classList.remove('otter-pet-wave');
      void root.offsetWidth;
      root.classList.add('otter-pet-wave');
    }
  };

  const onTerminals = () => {
    const list = agents();
    const ids = new Set(list.map((t) => t.id));
    for (const id of [...seen.keys()]) if (!ids.has(id)) seen.delete(id);
    for (const t of list) {
      const before = seen.get(t.id);
      seen.set(t.id, t.state);
      if (BUSY.has(t.state)) lastBusy = Date.now();
      if (before === undefined || before === t.state || lookedAt(t)) continue;
      if (NEEDS.has(t.state) && !NEEDS.has(before)) {
        say({ id: t.id, name: t.name, group: t.group, line: `${ASKS[t.state] ?? 'needs you'}.`, mood: 'worried', needs: true, state: t.state, stateSince: t.stateSince, msg: null });
      } else if (ENDED.has(t.state) && !ENDED.has(before) && told.get(t.id) !== t.lastMessage) {
        told.set(t.id, t.lastMessage);
        const mode = otterm.config.get('say');
        const line = mode === 'nothing' ? '' : mode === 'name' ? 'finished.' : speakable(t.lastMessage) || 'finished.';
        if (line) say({ id: t.id, name: t.name, group: t.group, line, mood: moodFor(line), needs: false, state: t.state, stateSince: t.stateSince, msg: t.lastMessage });
        else {
          mood = 'happy';
          moodUntil = Date.now() + HAPPY_MS;
        }
      }
    }
    // A line about a terminal that has moved on (you answered, it's working again) goes unsaid.
    queue = queue.filter(stillTrue);
    if (current && !stillTrue(current)) next();
    paint();
  };

  otterm.on('terminals', onTerminals);
  otterm.on('focus', onTerminals);
  otterm.on('layout', place);
  otterm.config.onChange(() => {
    place();
    paint();
  });
  // Moods wear off and sleep comes without any event, so the face is looked at again now and then.
  const tick = setInterval(paint, 5000);
  paint();

  return () => {
    clearInterval(tick);
    hideBubble();
    window.removeEventListener('resize', place);
    root.remove();
  };
}
