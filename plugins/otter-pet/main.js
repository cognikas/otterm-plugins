// Otter pet: an otter that floats over the window. Drag it anywhere and it stays there. What it does shows how the
// terminals are doing: it types on a laptop while one works, juggles its stone while one waits on its own background
// work, waves with a "!" when one needs you, sheds a tear when one failed, and floats asleep on its back when nothing
// has worked for a while. A bubble says what Claude finished in the terminals you aren't looking at, and when a
// context is nearly full, the 5-hour limit is near, or you've worked long without a break. A click opens the terminal
// it's talking about; right-click it, or hold it, for its menu. One otter for every terminal, or one per group: a raft.
//
// Plugin API 1 has no floating layer yet (cognikas/otterm#20), so it adds its own elements to the page and takes them
// away when it unloads. Its voice (chimera) comes in 1.1, once Otterm lets a plugin load its wasm in a worker.

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Claude or Codex asks you something. */
const NEEDS = new Set(['approval', 'trust', 'hooks', 'channels']);
/** The agent is busy. */
const BUSY = new Set(['starting', 'working']);
/** The turn is over: your turn, or the agent waits on its own background work (a dev server, a subagent). */
const ENDED = new Set(['your-turn', 'background']);
/** Anything but resting: leaving one of these is when the otter starts counting toward sleep. */
const ACTIVE = new Set([...NEEDS, ...BUSY, 'background']);
/** Claude waits at its prompt, where /compact can be sent. */
const AT_PROMPT = new Set(['ready', 'your-turn']);
/** @type {Record<string, number>} */
const SIZES = { small: 72, medium: 96, large: 128 };
const MARGIN = 12;
/** Movement that makes a press a drag, not a click (px). */
const DRAG_PX = 5;
/** A press held this long opens the menu: touch has no right-click. */
const LONG_PRESS_MS = 550;
/** How fast the bubble shows the words: about the pace of speech. */
const WORDS_PER_SECOND = 2.5;
/** How long a finish's joy lasts: happy eyes, the stone held up, confetti. */
const CHEER_MS = 6000;
/** Working this long makes it sweat. */
const SWEAT_MS = 10 * 60_000;
/** No key or click on the page for this long counts as a break. */
const BREAK_GAP_MS = 10 * 60_000;
/** The most otters in a raft: more groups than this share the last one. */
const MAX_OTTERS = 6;
/** How much each otter of a raft overlaps the one before it, as a share of its width. */
const OVERLAP = 0.18;
/** A gesture between two states (it wakes up and stretches, a rain cloud drifts off) lasts this long. */
const MOMENT_MS = 1600;
/** The bump and splash when it's put down after a drag. */
const LAND_MS = 700;
/** Its widest swing while it's dragged, in degrees, and how far it swings for each px/ms it's pulled at. */
const SWING_MAX = 16;
const SWING_GAIN = 10;
/**
 * Stroking it with the mouse: this far over it, going back and forth (two turns, each after at least PET_RUN_PX one
 * way, so passing over it on the way somewhere isn't a stroke), and how long it stays pleased once the hand stops.
 */
const PET_PX = 90;
const PET_RUN_PX = 12;
const PET_END_MS = 900;
/** Notices in the last reply that aren't Claude's answer: the otter keeps quiet about them. */
const NOT_AN_ANSWER =
  /^(you['’]ve (hit|reached) your|claude (ai )?usage limit|credit balance is too low|api error|request timed out|\[?request interrupted|interrupted by user|session limit reached)/i;
export const MAX_WORDS = 20;

/** What each question is, after the terminal's name. @type {Record<string, string>} */
const ASKS = {
  approval: 'asks for your permission',
  trust: 'asks to trust its folder',
  hooks: 'asks to trust its hooks',
  channels: 'asks about development channels',
};

/** Everything the otter says or shows in words. */
const TEXT = {
  pet: 'Otter pet',
  needsYou: 'needs you',
  finished: 'finished.',
  failed: 'it failed',
  noGroup: 'No group',
  otherGroups: 'Other groups',
  plan: 'Your Claude plan',
  compact: 'Compact',
  hint: "Click: opens the terminal it's talking about. Right-click or hold: more. Drag to move it.",
  /** @param {string} ctx */
  hot: (ctx) => `Its context is at ${ctx}.`,
  /** @param {string} name */
  compacting: (name) => `Compacting ${name}…`,
  /** @param {string} pct @param {string} at */
  planNear: (pct, at) => `You've used ${pct} of the 5-hour limit.${at ? ` It resets at ${at}.` : ''}`,
  /** @param {number} min */
  pause: (min) => `You've been at it for ${min} minutes. Time for a short break?`,
  /** @param {Counts} n */
  status: (n) => {
    const parts = [];
    if (n.needs) parts.push(n.needs === 1 ? 'one needs you' : `${n.needs} need you`);
    if (n.failed) parts.push(n.failed === 1 ? 'one failed' : `${n.failed} failed`);
    if (n.busy) parts.push(n.busy === 1 ? 'one is working' : `${n.busy} are working`);
    if (n.bg) parts.push(n.bg === 1 ? 'one waits on its own work' : `${n.bg} wait on their own work`);
    if (n.turn) parts.push(n.turn === 1 ? 'one waits for you' : `${n.turn} wait for you`);
    if (!parts.length) return n.asleep ? 'All quiet: nothing has worked for a while.' : 'All quiet.';
    const line = `${parts.join(', ')}.`;
    return line.charAt(0).toUpperCase() + line.slice(1);
  },
  menu: {
    status: 'How are they?',
    again: 'Say the last one again',
    /** @param {string} name @param {string} why */
    open: (name, why) => `Open ${name}: ${why}`,
    dnd: 'Do not disturb',
    m30: '30 min',
    h1: '1 hour',
    tomorrow: 'Until tomorrow',
    /** @param {string} until */
    dndOff: (until) => `Disturb me again (quiet until ${until})`,
    size: 'Size',
    sizes: /** @type {Record<string, string>} */ ({ small: 'S', medium: 'M', large: 'L' }),
    character: 'Character',
    animals: /** @type {Record<string, string>} */ ({ otter: 'Otter', cat: 'Cat', penguin: 'Penguin', beaver: 'Beaver' }),
    otters: 'Otters',
    one: 'One',
    group: 'Per group',
    corner: 'Back to the corner',
  },
};

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

/** A file's extension at the end of a code span (with a line number, perhaps): a member such as console.log isn't one. */
const FILE_EXT =
  /\.(js|mjs|cjs|jsx|ts|tsx|json|md|css|scss|html|py|rb|go|rs|java|kt|swift|sh|zsh|ya?ml|toml|txt|sql|vue|svelte|c|h|cc|cpp|hpp|cs|php|lock|env|xml|csv|ini|cfg|plist|gradle|dart|lua|ex|exs)(:\d+(-\d+)?)?$/i;

/**
 * A code span as a word: `src/daemon/usage.ts:520` is "usage"; `npm run test` and `console.log` stay; a commit hash
 * says nothing.
 * @param {string} code
 */
function codeWord(code) {
  const c = code.trim();
  if (/\s/.test(c)) return c;
  if (/[\\/]/.test(c) || FILE_EXT.test(c)) {
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

// Words, in English or Spanish, with no letter or digit on either side: \b counts only ASCII letters, so "falló." would
// slip through it.
/** A failure named in a line. */
const FAILURE =
  /(?<![\p{L}\p{N}])(fail(ed|s|ing|ures?)?|errors?|broke|broken|crash(ed|es)?|couldn['’]?t|could not|can['’]?t|cannot|unable|(\p{L}+n['’]t|not|no|never) pass(es|ed|ing)?|not all (\d+ )?(tests|checks)|no pude|no logré|falló|fallan?|fallaron|fallando|rompió|no se puede|no pasan?|no pasaron)(?![\p{L}\p{N}])/iu;
/** A fix or a pass in the same line (not "not passing"): the failure it names is over. */
const FIXED =
  /(?<![\p{L}\p{N}])(fix(ed|es)?|resolved|solved|(?<!(\p{L}n['’]t|not|no|never) |not all (\d+ )?(tests|checks) )pass(es|ed|ing)?|no (more )?(errors?|failures?)|works now|arregl(é|ad[oa]s?)|correg(í|id[oa]s?)|resuelt[oa]s?|solucionad[oa]s?|(?<!no )pasan|(?<!no )pasaron|sin errores|ya funciona)(?![\p{L}\p{N}])/iu;
/** ...unless it says the failure goes on: "still fails after the fix", "couldn't fix it". */
const STILL =
  /(?<![\p{L}\p{N}])(still|again|couldn['’]?t|could not|can['’]?t|cannot|didn['’]?t|did not|unable|todavía|aún|sigue|siguen|no pude|no logré)(?![\p{L}\p{N}])/iu;

/**
 * The otter's face for a line: a failure looks sad (not one the line says was fixed or passes now), anything else
 * happy.
 * @param {string} line
 * @returns {'sad' | 'happy'}
 */
export function moodFor(line) {
  return FAILURE.test(line) && (!FIXED.test(line) || STILL.test(line)) ? 'sad' : 'happy';
}

/**
 * Whether a reply is one of the notices that aren't Claude's answer (the usage limit, an API error).
 * @param {string | null | undefined} message
 */
export function isNotice(message) {
  return NOT_AN_ANSWER.test(String(message ?? '').trim());
}

/** Tests passing (not "not passing") or something shipped. */
const CHEERS =
  /(?<![\p{L}\p{N}])(tests? (now )?(?<!(\p{L}n['’]t|not|no|never) )pass(es|ed|ing)?|(?<!not )all (\d+ )?(tests|checks)( now)? pass(es|ed)?|(?<!(\p{L}n['’]t|not|no|never) )passing|green|merged|released|shipped|deployed|published|(?<!no )pasan|(?<!no )pasaron|en verde|mergead[oa]|publicad[oa]|desplegad[oa])(?![\p{L}\p{N}])/iu;

/**
 * How a good finish is celebrated: confetti when the tests pass or something shipped, the stone held up otherwise.
 * @param {string} line
 * @returns {'trophy' | 'confetti'}
 */
export function cheerFor(line) {
  return CHEERS.test(line) ? 'confetti' : 'trophy';
}

/**
 * Whether a time of day is inside quiet hours written as "22:00-08:00" (a span past midnight works).
 * @param {unknown} spec
 * @param {Date} now
 */
export function inQuietHours(spec, now) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(typeof spec === 'string' ? spec : '');
  if (!m) return false;
  const [h1, m1, h2, m2] = [m[1], m[2] ?? '0', m[3], m[4] ?? '0'].map(Number);
  // A real time of day: hours to 24, minutes to 59, and 24 only as 24:00.
  if ([[h1, m1], [h2, m2]].some(([h, min]) => h > 24 || min > 59 || (h === 24 && min > 0))) return false;
  const from = h1 * 60 + m1;
  const to = h2 * 60 + m2;
  if (from === to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * The next 8:00 in the morning: "until tomorrow" for Do not disturb (today's, when it's still before 8).
 * @param {Date} now
 */
export function nextMorning(now) {
  const at = new Date(now);
  at.setHours(8, 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** Night, from 22:00 to 6:00: it yawns now and then, and sleeps in a nightcap. @param {Date} now */
export function isNight(now) {
  const hour = now.getHours();
  return hour >= 22 || hour < 6;
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

const CONFETTI = ['#e5484d', '#f5a524', '#46a758', '#3e8ef7', '#a855f7', '#ec4899'];

/**
 * What changes from one animal to another. Everything else (the face, the paws, the props of each state) is shared,
 * so every animal has every pose.
 * @typedef {{ ears: 'round' | 'small' | 'pointy' | 'none', face: 'muzzle' | 'mask', nose: 'otter' | 'cat' | 'beak' | 'beaver', whiskers: boolean, tail: 'none' | 'curl' | 'paddle', feet: boolean, sleep: 'float' | 'cushion' }} Animal
 */
/** @type {Record<string, Animal>} */
const ANIMALS = {
  otter: { ears: 'round', face: 'muzzle', nose: 'otter', whiskers: true, tail: 'none', feet: false, sleep: 'float' },
  cat: { ears: 'pointy', face: 'muzzle', nose: 'cat', whiskers: true, tail: 'curl', feet: false, sleep: 'cushion' },
  penguin: { ears: 'none', face: 'mask', nose: 'beak', whiskers: false, tail: 'none', feet: true, sleep: 'float' },
  beaver: { ears: 'small', face: 'muzzle', nose: 'beaver', whiskers: true, tail: 'paddle', feet: false, sleep: 'float' },
};
const ANIMAL_KEYS = Object.keys(ANIMALS);

/**
 * How many tasks a terminal waits on, from Otterm's few words about its background work ("Review auth and 2 more"):
 * at least one while it waits.
 * @param {string | null | undefined} work
 */
export function backgroundCount(work) {
  const m = / and (\d+) more$/.exec(String(work ?? ''));
  return m ? 1 + Number(m[1]) : 1;
}

/** The ears, a pair of groups that can droop. @param {Animal['ears']} kind */
function ears(kind) {
  if (kind === 'none') return [];
  const pair = (/** @type {(s: number) => SVGElement[]} */ draw) =>
    [-1, 1].map((s) => svg('g', { class: `otter-pet-ear otter-pet-ear-${s < 0 ? 'l' : 'r'}` }, ...draw(s)));
  if (kind === 'pointy') {
    return pair((s) => [
      svg('path', { class: 'otter-pet-fur', d: `M${120 + s * 70} 74 L${120 + s * 50} 20 L${120 + s * 22} 48 Z` }),
      svg('path', { class: 'otter-pet-ear-in', d: `M${120 + s * 60} 64 L${120 + s * 48} 34 L${120 + s * 32} 50 Z` }),
    ]);
  }
  const [x, y, r] = kind === 'small' ? [52, 62, 11] : [58, 58, 15];
  return pair((s) => [svg('circle', { cx: 120 + s * x, cy: y, r, class: 'otter-pet-fur' }), svg('circle', { cx: 120 + s * x, cy: y, r: r / 2, class: 'otter-pet-fur-dark' })]);
}

/** The light part of the face: a muzzle, or a penguin's mask around the eyes. @param {Animal['face']} kind */
function face(kind) {
  return kind === 'mask'
    ? svg('path', { class: 'otter-pet-muzzle', d: 'M120 86 C146 62 184 80 177 118 C172 152 146 176 120 176 C94 176 68 152 63 118 C56 80 94 62 120 86 Z' })
    : svg('ellipse', { cx: 120, cy: 140, rx: 50, ry: 36, class: 'otter-pet-muzzle' });
}

/** @param {Animal['nose']} kind */
function nose(kind) {
  if (kind === 'cat') return svg('path', { class: 'otter-pet-nose-pink', d: 'M112 124 h16 l-8 9 z' });
  if (kind === 'beak') return svg('path', { class: 'otter-pet-beak', d: 'M103 124 Q120 115 137 124 L120 145 Z' });
  return svg('path', { d: 'M107 124 q13 -6 26 0 q-3 11 -13 13 q-10 -2 -13 -13z', fill: '#2a1a12' });
}

/** Behind the body: a cat's curled tail, a beaver's paddle. @param {Animal['tail']} kind */
function tail(kind) {
  if (kind === 'curl') return [svg('path', { class: 'otter-pet-tail-curl', d: 'M178 236 C220 232 230 188 204 170' })];
  if (kind === 'paddle') {
    return [
      svg(
        'g',
        { class: 'otter-pet-paddle' },
        svg('ellipse', { cx: 194, cy: 238, rx: 34, ry: 15, transform: 'rotate(-22 194 238)' }),
        svg('path', { class: 'otter-pet-paddle-lines', d: 'M176 236 l32 -13 M182 247 l32 -13 M182 228 l14 18 M199 221 l14 18' }),
      ),
    ];
  }
  return [];
}

/** The animal (an otter unless you pick another), holding a stone, with a face for each mood and the props of each state. @param {string} [kind] */
function drawOtter(kind = 'otter') {
  const a = ANIMALS[kind] ?? ANIMALS.otter;
  const eye = (/** @type {number} */ x) =>
    svg('g', { class: 'otter-pet-eye', transform: `translate(${x} 106)` }, svg('circle', { r: 9, fill: '#1d1410' }), svg('circle', { cx: 3, cy: -3, r: 3, fill: '#fff' }));
  const drop = (/** @type {string} */ name, /** @type {number} */ x, /** @type {number} */ y) =>
    svg('path', { class: `otter-pet-drop otter-pet-${name}`, d: `M${x} ${y} q-6 9 0 13 q6 -4 0 -13z` });
  const sparkle = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r) => {
    const k = r * 0.3;
    return svg('path', { class: 'otter-pet-sparkle', d: `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z` });
  };
  const heart = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) =>
    svg('path', {
      class: 'otter-pet-heart',
      d: `M${x} ${y + s * 0.9}C${x - s * 1.6} ${y - s * 0.1} ${x - s * 0.7} ${y - s * 1.3} ${x} ${y - s * 0.45}C${x + s * 0.7} ${y - s * 1.3} ${x + s * 1.6} ${y - s * 0.1} ${x} ${y + s * 0.9}Z`,
    });
  const stroke = { fill: 'none', stroke: '#1d1410', 'stroke-width': 4.5, 'stroke-linecap': 'round' };
  const brow = { stroke: '#1d1410', 'stroke-width': 4, 'stroke-linecap': 'round' };
  // A pup rides on the belly while background work runs: a small head of the same animal, eyes shut.
  const pup = (/** @type {string} */ name, /** @type {number} */ x) =>
    svg(
      'g',
      { class: `otter-pet-pup otter-pet-pup-${name}` },
      svg('ellipse', { cx: x, cy: 240, rx: 20, ry: 12, class: 'otter-pet-fur' }),
      svg(
        'g',
        { transform: `translate(${x - 120 * 0.3} ${216 - 108 * 0.3}) scale(0.3)` },
        ...ears(a.ears),
        svg('circle', { cx: 120, cy: 108, r: 70, class: 'otter-pet-fur' }),
        face(a.face),
        svg('g', { ...stroke, 'stroke-width': 9 }, svg('path', { d: 'M80 106 q12 10 24 0' }), svg('path', { d: 'M136 106 q12 10 24 0' })),
        nose(a.nose),
      ),
    );
  // Asleep, it floats on its back and the z's rise from its face, then on the left; a cat sleeps sitting on its
  // cushion, the z's at its ear.
  const [zx, zy] = a.sleep === 'cushion' ? [174, 66] : [84, 92];
  const z = (/** @type {number} */ i) => {
    const t = svg('text', { class: `otter-pet-z otter-pet-z${i}`, x: zx + i * 13, y: zy - i * 15 });
    t.textContent = 'z';
    return t;
  };
  // Code it types rises from behind the laptop, at its sides, clear of the face.
  const glyph = (/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ i) => {
    const t = svg('text', { class: `otter-pet-glyph otter-pet-glyph${i}`, x, y: 170, 'text-anchor': 'middle' });
    t.textContent = text;
    return t;
  };
  /** A strip of water from y, its waves 40 wide and amp high, down past the bottom. @param {number} y @param {number} amp */
  const water = (y, amp) => {
    let d = `M-40 ${y}`;
    for (let x = -40; x < 300; x += 40) d += ` q10 ${-amp} 20 0 q10 ${amp} 20 0`;
    return `${d} V262 H-40 Z`;
  };
  const bits = Array.from({ length: 14 }, (_, i) =>
    svg('rect', {
      class: 'otter-pet-bit',
      x: 16 + ((i * 53) % 208),
      y: -12 - (i % 3) * 8,
      width: 7,
      height: 11,
      rx: 1.5,
      fill: CONFETTI[i % CONFETTI.length],
      style: `--d: ${((i * 7) % 10) / 16}s; --t: ${(1.7 + ((i * 3) % 5) / 6).toFixed(2)}s; --x: ${((i * 37) % 60) - 30}px`,
    }),
  );
  return svg(
    'svg',
    { class: 'otter-pet-otter', viewBox: '0 0 240 260', 'aria-hidden': 'true' },
    svg('rect', { class: 'otter-pet-cushion', x: 14, y: 210, width: 212, height: 36, rx: 18 }),
    svg(
      'g',
      { class: 'otter-pet-body' },
      ...tail(a.tail),
      svg('ellipse', { cx: 120, cy: 212, rx: 74, ry: 46, class: 'otter-pet-fur' }),
      svg('ellipse', { cx: 120, cy: 218, rx: 48, ry: 34, class: 'otter-pet-belly' }),
      ...(a.feet ? [svg('ellipse', { class: 'otter-pet-feet', cx: 96, cy: 254, rx: 17, ry: 7 }), svg('ellipse', { class: 'otter-pet-feet', cx: 144, cy: 254, rx: 17, ry: 7 })] : []),
      ...ears(a.ears),
      svg('circle', { cx: 120, cy: 108, r: 70, class: 'otter-pet-fur' }),
      face(a.face),
      // In a raft, a scarf in its group's color.
      svg('g', { class: 'otter-pet-scarf' }, svg('path', { d: 'M66 168 Q120 200 174 168 L176 181 Q120 214 64 181 Z' }), svg('path', { d: 'M146 186 l8 26 l13 -5 l-7 -24 Z' })),
      // The agent's hat: orange for Claude, slate for Codex.
      svg(
        'g',
        { class: 'otter-pet-hat' },
        svg('path', { class: 'otter-pet-hat-top', d: 'M72 66 Q120 4 168 66 Z' }),
        svg('rect', { class: 'otter-pet-hat-brim', x: 66, y: 56, width: 108, height: 15, rx: 7.5 }),
        svg('circle', { class: 'otter-pet-hat-ball', cx: 120, cy: 30, r: 9 }),
      ),
      // At night it sleeps in a nightcap, its tip flopped over to the side.
      svg(
        'g',
        { class: 'otter-pet-nightcap' },
        svg('path', { class: 'otter-pet-nightcap-cap', d: 'M72 66 C74 22 124 2 168 22 C194 34 208 58 206 84 C196 64 186 56 168 54 L168 66 Z' }),
        svg('rect', { class: 'otter-pet-nightcap-band', x: 66, y: 56, width: 108, height: 15, rx: 7.5 }),
        svg('circle', { class: 'otter-pet-nightcap-ball', cx: 206, cy: 88, r: 9 }),
      ),
      svg('ellipse', { class: 'otter-pet-cheek', cx: 78, cy: 138, rx: 11, ry: 7 }),
      svg('ellipse', { class: 'otter-pet-cheek', cx: 162, cy: 138, rx: 11, ry: 7 }),
      // The screen's light on its face while it types.
      svg('ellipse', { class: 'otter-pet-glow', cx: 120, cy: 156, rx: 52, ry: 20 }),
      svg('g', { class: 'otter-pet-eyes-open' }, eye(92), eye(148)),
      svg('g', { class: 'otter-pet-eyes-happy', ...stroke }, svg('path', { d: 'M82 109 q10 -12 20 0' }), svg('path', { d: 'M138 109 q10 -12 20 0' })),
      svg('g', { class: 'otter-pet-eyes-closed', ...stroke }, svg('path', { d: 'M82 106 q10 8 20 0' }), svg('path', { d: 'M138 106 q10 8 20 0' })),
      svg('g', { class: 'otter-pet-brows-sad', ...brow }, svg('path', { d: 'M80 93 l20 -6' }), svg('path', { d: 'M160 93 l-20 -6' })),
      svg('g', { class: 'otter-pet-brows-worried', ...brow }, svg('path', { d: 'M81 86 l19 -10' }), svg('path', { d: 'M159 86 l-19 -10' })),
      nose(a.nose),
      svg('path', { class: 'otter-pet-smile', d: 'M104 146 q8 8 16 0 q8 8 16 0', fill: 'none', stroke: '#2a1a12', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      svg('ellipse', { class: 'otter-pet-mouth', cx: 120, cy: 152, rx: 10, ry: 7, fill: '#4a1f1a' }),
      ...(a.nose === 'beaver'
        ? [svg('rect', { class: 'otter-pet-teeth', x: 110, y: 137, width: 9, height: 15, rx: 2 }), svg('rect', { class: 'otter-pet-teeth', x: 121, y: 137, width: 9, height: 15, rx: 2 })]
        : []),
      ...(a.whiskers
        ? [
            svg(
              'g',
              { class: 'otter-pet-whiskers', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 },
              svg('path', { d: 'M84 134 l-30 -6' }),
              svg('path', { d: 'M84 141 l-30 2' }),
              svg('path', { d: 'M156 134 l30 -6' }),
              svg('path', { d: 'M156 141 l30 2' }),
            ),
          ]
        : []),
      drop('sweat', 170, 70),
      drop('tear', 90, 118),
      svg('g', { class: 'otter-pet-toss' }, svg('ellipse', { cx: 120, cy: 196, rx: 20, ry: 14, class: 'otter-pet-stone' })),
      pup('one', 120),
      pup('two-a', 98),
      pup('two-b', 142),
      // Its paws go behind the laptop to type, on the keys you can't see.
      svg('ellipse', { class: 'otter-pet-paw otter-pet-paw-l', cx: 98, cy: 194, rx: 13, ry: 10 }),
      svg('ellipse', { class: 'otter-pet-paw otter-pet-paw-r', cx: 142, cy: 194, rx: 13, ry: 10 }),
      svg(
        'g',
        { class: 'otter-pet-laptop' },
        // The lid opens once the laptop is in front of it, and closes before it goes.
        svg(
          'g',
          { class: 'otter-pet-lid' },
          svg('rect', { class: 'otter-pet-laptop-lid', x: 80, y: 164, width: 80, height: 38, rx: 6 }),
          svg('circle', { class: 'otter-pet-laptop-logo', cx: 120, cy: 183, r: 5 }),
        ),
        svg('path', { class: 'otter-pet-laptop-base', d: 'M70 202 H170 L162 213 H78 Z' }),
      ),
      svg('g', { class: 'otter-pet-code' }, glyph('</>', 82, 0), glyph('{ }', 158, 1), glyph(';', 82, 2)),
      // An arm up to a raised paw, so the paw doesn't float: waving, and holding the stone up.
      svg('path', { class: 'otter-pet-arm otter-pet-arm-wave', d: 'M158 180 Q192 154 200 112' }),
      svg('path', { class: 'otter-pet-arm otter-pet-arm-cheer', d: 'M156 180 Q184 152 188 112' }),
      svg('g', { class: 'otter-pet-alert' }, svg('rect', { x: 194, y: 4, width: 12, height: 26, rx: 6 }), svg('circle', { cx: 200, cy: 40, r: 6.5 })),
      // A little rain cloud over its head when one failed.
      svg(
        'g',
        { class: 'otter-pet-cloud' },
        svg('path', { class: 'otter-pet-cloud-body', d: 'M86 8 a12 12 0 0 1 16 -12 a17 17 0 0 1 32 2 a12 12 0 0 1 20 10 a8 8 0 0 1 -6 14 h-58 a8 8 0 0 1 -4 -14 z' }),
        svg('path', { class: 'otter-pet-rain otter-pet-rain0', d: 'M100 28 l-3 9' }),
        svg('path', { class: 'otter-pet-rain otter-pet-rain1', d: 'M120 28 l-3 9' }),
        svg('path', { class: 'otter-pet-rain otter-pet-rain2', d: 'M140 28 l-3 9' }),
      ),
      // Around the stone, held up beside its head when a turn ends well.
      svg('g', { class: 'otter-pet-sparkles' }, sparkle(214, 50, 9), sparkle(160, 46, 6), sparkle(216, 104, 6)),
    ),
    // The water it floats on when asleep, over its lower half, drifting.
    svg(
      'svg',
      { class: 'otter-pet-water', x: 0, y: 150, width: 240, height: 112, viewBox: '0 150 240 112' },
      svg('path', { class: 'otter-pet-waves otter-pet-waves-back', d: water(206, 9) }),
      svg('path', { class: 'otter-pet-waves otter-pet-waves-front', d: water(218, 10) }),
    ),
    z(0),
    z(1),
    z(2),
    svg('g', { class: 'otter-pet-confetti' }, ...bits),
    // Stroked with the mouse, hearts rise beside its head.
    svg('g', { class: 'otter-pet-hearts' }, heart(50, 62, 10), heart(30, 40, 7)),
    // Put down after a drag: a splash where it lands (a puff of dust under a cat).
    svg(
      'g',
      { class: 'otter-pet-splash' },
      svg('ellipse', { class: 'otter-pet-ripple', cx: 120, cy: 252, rx: 80, ry: 12 }),
      svg('ellipse', { class: 'otter-pet-ripple otter-pet-ripple1', cx: 120, cy: 252, rx: 104, ry: 15 }),
      drop('splash0', 40, 228),
      drop('splash1', 66, 216),
      drop('splash2', 174, 216),
      drop('splash3', 200, 228),
    ),
  );
}

/** @typedef {'neutral' | 'sad' | 'happy' | 'worried'} Mood */
/** @typedef {'none' | 'trophy' | 'confetti'} Cheer */
/** @typedef {{ needs: number, failed: number, busy: number, bg: number, turn: number, asleep: boolean }} Counts */

/**
 * A line the otter has to say.
 * @typedef {object} Said
 * @property {string} key One line per key: a terminal's id, or the kind of line.
 * @property {'needs' | 'finish' | 'hot' | 'plan' | 'break' | 'status'} kind
 * @property {string} id The terminal it's about; '' for none.
 * @property {string} name Who: the terminal, or the otter's group.
 * @property {string | null} group For the dot's color.
 * @property {string} line
 * @property {Mood} mood
 * @property {Cheer} [cheer]
 * @property {string} [state]
 * @property {number} [stateSince]
 * @property {string | null} [msg]
 * @property {string} [note] A second line under it: a context that's nearly full.
 * @property {{ label: string, run: () => void }} [action] A button under it.
 * @property {string} [otter] The otter that says it (its key), when it isn't the terminal's group's.
 * @property {boolean} [asked] You asked for it (a click, the menu): it shows even in quiet hours or Do not disturb.
 * @property {() => void} [onShown] Called when it shows: a notice counts as told only then.
 */

/**
 * One otter of the raft (or the only one): which groups it stands for, and its own passing mood.
 * @typedef {{ key: string, groups: Set<string | null> | null, group: string | null, name: string }} Spec
 * @typedef {Spec & { el: HTMLElement, mood: Mood, cheer: Cheer, moodUntil: number, moment: ReturnType<typeof setTimeout> | null }} Otter
 */

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  if (otterm.where === 'remote' && otterm.config.get('phone') === false) return;
  const h = otterm.ui.h;

  // ---- The elements: the raft (one otter, or one per group) under one bubble, and the menu.

  const who = h('span', { class: 'otter-pet-who' });
  const words = h('span', { class: 'otter-pet-words' });
  const noteText = h('span', { class: 'otter-pet-note' });
  const act = h('button', { class: 'otter-pet-act', type: 'button', hidden: true });
  const extra = h('span', { class: 'otter-pet-extra', hidden: true }, noteText, act);
  const close = h('button', { class: 'otter-pet-close', type: 'button', title: 'Dismiss', 'aria-label': 'Dismiss' }, '×');
  const bubble = h('div', { class: 'otter-pet-bubble', role: 'status', 'aria-live': 'polite', hidden: true }, close, who, words, extra);
  const row = h('div', { class: 'otter-pet-row' });
  const root = h('div', { class: 'otter-pet' }, bubble, row);
  const menu = h('div', { class: 'otter-pet-menu', role: 'menu', 'aria-label': TEXT.pet, hidden: true });
  document.body.append(root, menu);

  /** @type {Otter[]} */
  let otters = [];
  const agents = () => otterm.terminals().filter((t) => t.kind !== 'shell');
  /** @param {Otter} o */
  const mine = (o) => (/** @type {import('otterm-plugin').Terminal} */ t) => !o.groups || o.groups.has(t.group);

  /** A choice made in the menu, kept on this device; else the setting. @param {string} key @param {string[]} allowed */
  const choice = (key, allowed) => {
    const kept = otterm.store.get(key);
    if (typeof kept === 'string' && allowed.includes(kept)) return kept;
    const set = otterm.config.get(key);
    return typeof set === 'string' && allowed.includes(set) ? set : allowed[0];
  };
  const mode = () => (otterm.phone ? 'one' : choice('otters', ['one', 'group']));
  const animal = () => choice('character', ANIMAL_KEYS);
  /** The animal the otters are drawn as. */
  let drawn = animal();

  /** @param {Spec} w @returns {Otter} */
  const makeOtter = (w) => {
    const el = h('div', {
      class: 'otter-pet-one',
      role: 'button',
      tabindex: '0',
      'aria-haspopup': 'menu',
      'data-activity': 'idle',
      'data-mood': 'neutral',
      'data-cheer': 'none',
      'data-long': 'false',
      'data-talking': 'false',
      'data-species': drawn,
      'data-moment': 'none',
      'data-petted': 'false',
      'data-night': 'false',
    });
    el.append(drawOtter(drawn));
    return { ...w, el, mood: 'neutral', cheer: 'none', moodUntil: 0, moment: null };
  };
  /** Draws every otter again as the animal picked, when it changed. */
  const redraw = () => {
    const kind = animal();
    if (kind === drawn) return;
    drawn = kind;
    for (const o of otters) {
      o.el.dataset.species = kind;
      o.el.replaceChildren(drawOtter(kind));
    }
  };

  /** One otter, or one per group that has an agent (in the sidebar's order, No group last). */
  const arrange = () => {
    /** @type {Spec[]} */
    let want = [];
    if (mode() === 'group') {
      /** @type {(string | null)[]} */
      const order = [];
      for (const t of agents()) if (!order.includes(t.group)) order.push(t.group);
      /** @type {(string | null)[]} */
      const groups = order.filter((g) => g !== null);
      if (order.includes(null)) groups.push(null);
      const head = groups.length > MAX_OTTERS ? groups.slice(0, MAX_OTTERS - 1) : groups;
      const rest = groups.slice(head.length);
      want = head.map((g) => ({ key: `group:${g ?? ''}`, groups: new Set([g]), group: g, name: g ?? TEXT.noGroup }));
      if (rest.length) want.push({ key: 'rest', groups: new Set(rest), group: null, name: TEXT.otherGroups });
    }
    if (want.length < 2) want = [{ key: 'all', groups: null, group: null, name: TEXT.pet }];
    const byKey = new Map(otters.map((o) => [o.key, o]));
    const same = want.length === otters.length && want.every((w, i) => otters[i].key === w.key);
    otters = want.map((w) => {
      const o = byKey.get(w.key);
      if (!o) return makeOtter(w);
      o.groups = w.groups;
      o.group = w.group;
      o.name = w.name;
      return o;
    });
    for (const o of byKey.values()) if (!otters.includes(o) && o.moment) clearTimeout(o.moment);
    for (const o of otters) o.el.style.setProperty('--otter-pet-group', otterm.ui.groupColor(o.group));
    if (!same) {
      // Only what changed moves: an otter put back in the page would start its pose again (lie down, pop its "!").
      for (const old of [...row.children]) if (!otters.some((o) => o.el === old)) old.remove();
      otters.forEach((o, i) => {
        if (row.children[i] !== o.el) row.insertBefore(o.el, row.children[i] ?? null);
      });
      place();
    }
  };

  // ---- Where it is: kept per device as a share of the room it has, so it stays put when the window is resized.

  const kept = /** @type {{ fx?: unknown, fy?: unknown } | null} */ (otterm.store.get('at'));
  /** Bottom right until it's moved. @type {{ fx: number, fy: number }} */
  let at = typeof kept?.fx === 'number' && typeof kept.fy === 'number' ? { fx: kept.fx, fy: kept.fy } : { fx: 1, fy: 1 };
  /** One otter's width. */
  const unit = () => {
    const px = SIZES[choice('size', ['medium', 'small', 'large'])] ?? SIZES.medium;
    return Math.round(px * (otterm.phone ? 0.75 : 1) * (otters.length > 1 ? 0.8 : 1));
  };
  const width = () => {
    const s = unit();
    return Math.round(s + (otters.length - 1) * s * (1 - OVERLAP));
  };
  /** One otter's height: its drawing is 240 wide and 260 tall. */
  const tall = () => Math.round((unit() * 260) / 240);
  const room = () => ({ w: Math.max(0, window.innerWidth - width() - 2 * MARGIN), h: Math.max(0, window.innerHeight - tall() - 2 * MARGIN) });
  /** The otter of a group. @param {string | null} group */
  const otterOfGroup = (group) => otters.find((o) => !o.groups || o.groups.has(group)) ?? otters[0];
  /** The otter that says a line: the one it names, else the one of the terminal's group, else the first. @param {Said} s */
  const otterOf = (s) => (s.otter ? otters.find((o) => o.key === s.otter) : undefined) ?? (s.id ? otterOfGroup(s.group) : otters[0]);
  const place = () => {
    const s = unit();
    const r = room();
    root.style.setProperty('--otter-pet-size', `${s}px`);
    root.classList.toggle('otter-pet-raft', otters.length > 1);
    const left = MARGIN + Math.min(1, Math.max(0, at.fx)) * r.w;
    const top = MARGIN + Math.min(1, Math.max(0, at.fy)) * r.h;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    // The bubble points at the otter that speaks, and opens where there's room: below near the top of the window,
    // leaning in from the sides.
    const speaker = current ? otters.indexOf(otterOf(current)) : 0;
    const anchor = Math.max(0, speaker) * s * (1 - OVERLAP) + s / 2;
    root.style.setProperty('--otter-pet-anchor', `${Math.round(anchor)}px`);
    root.classList.toggle('otter-pet-below', top < 170);
    root.classList.toggle('otter-pet-lean-left', left + anchor > window.innerWidth - 150);
    root.classList.toggle('otter-pet-lean-right', left + anchor < 150);
  };

  // ---- What the terminals are doing.

  /** Each agent's last state seen, to tell a finish or a question from any other change. @type {Map<string, string>} */
  const seen = new Map(agents().map((t) => [t.id, t.state]));
  /** The reply each terminal was last told about. @type {Map<string, string | null>} */
  const told = new Map(agents().map((t) => [t.id, t.lastMessage]));
  /**
   * How each terminal's last turn ended (your turn, or its own background work). When background work ends, Claude
   * may work again and come back to the same reply: that isn't a new finish. After your turn, the same first line
   * ("Done.") is a new one. @type {Map<string, string>}
   */
  const endedIn = new Map(agents().flatMap((t) => (ENDED.has(t.state) ? [[t.id, t.state]] : [])));
  /** When each agent was last doing something: sleep comes after a while without it. @type {Map<string, number>} */
  const busyAt = new Map(agents().map((t) => [t.id, ACTIVE.has(t.state) ? Date.now() : t.stateSince]));
  /** When each terminal's current question began, once told (or there when the otter came): a new one is told too. @type {Map<string, number>} */
  const asked = new Map(agents().flatMap((t) => (NEEDS.has(t.state) ? [[t.id, t.stateSince]] : [])));
  /** Terminals whose last reply reads as a failure you haven't seen yet: the otter is sad until you look. @type {Set<string>} */
  const failed = new Set();
  /** @param {import('otterm-plugin').Terminal} t */
  const full = (t) => otterm.context(t).tone === 'hot';
  const warnFull = () => otterm.config.get('warnHot') !== false;
  /** Terminals already told about a full context, until it empties again (one already full now isn't news). */
  const warnedFull = new Set(agents().filter(full).map((t) => t.id));
  /** Lines waiting their turn. @type {Said[]} */
  let queue = [];
  /** @type {Said | null} */
  let current = null;
  /** The last line said, for "say it again". @type {Said | null} */
  let last = null;

  /** You're looking at it now: it has the keyboard, in the window in front. @param {import('otterm-plugin').Terminal} t */
  const seenNow = (t) => otterm.focused() === t.id && document.hasFocus() && !document.hidden;
  /** It doesn't need telling about, as set in Tell me about. @param {import('otterm-plugin').Terminal} t */
  const lookedAt = (t) => otterm.config.get('which') !== 'all' && seenNow(t);

  const dndUntil = () => {
    const v = otterm.store.get('dnd');
    return typeof v === 'number' ? v : 0;
  };
  const hushed = () => Date.now() < dndUntil() || inQuietHours(otterm.config.get('quiet'), new Date());

  /** @param {Said} s */
  const stillTrue = (s) => {
    if (!s.id) return true;
    const t = otterm.terminal(s.id);
    if (!t) return false;
    if (s.asked) return true;
    if (lookedAt(t)) return false;
    // A question holds while it's asked; a full context while Claude waits at its prompt; a finish while the terminal
    // rests on that reply (your turn, or its own background work).
    if (s.kind === 'needs') return t.state === s.state && t.stateSince === s.stateSince;
    if (s.kind === 'hot') return AT_PROMPT.has(t.state) && full(t);
    return ENDED.has(t.state) && t.lastMessage === s.msg;
  };

  /** @param {import('otterm-plugin').Terminal[]} list @param {boolean} asleep @returns {Counts} */
  const counts = (list, asleep) => {
    const n = (/** @type {(t: import('otterm-plugin').Terminal) => boolean} */ f) => list.filter(f).length;
    return {
      needs: n((t) => NEEDS.has(t.state)),
      failed: n((t) => failed.has(t.id)),
      busy: n((t) => BUSY.has(t.state)),
      bg: n((t) => t.state === 'background' && !failed.has(t.id)),
      turn: n((t) => t.state === 'your-turn' && !failed.has(t.id)),
      asleep,
    };
  };

  /** The most urgent thing among some terminals: it needs you, failed, works, waits on itself, rests, sleeps. @param {import('otterm-plugin').Terminal[]} list */
  const activityOf = (list) => {
    if (list.some((t) => NEEDS.has(t.state))) return 'needs';
    if (list.some((t) => failed.has(t.id))) return 'failed';
    if (list.some((t) => BUSY.has(t.state))) return 'busy';
    if (list.some((t) => t.state === 'background')) return 'waiting';
    const after = otterm.config.get('sleepAfter');
    const lastBusy = Math.max(0, ...list.map((t) => busyAt.get(t.id) ?? 0));
    if (typeof after === 'number' && after > 0 && Date.now() - lastBusy >= after * 60_000) return 'asleep';
    return 'idle';
  };

  /**
   * The terminal behind what an otter shows (the one that needs you, failed, works, waits on itself; else the last to
   * change): its agent's hat goes on the otter.
   * @param {import('otterm-plugin').Terminal[]} list
   * @param {string} act
   */
  const leadOf = (list, act) =>
    (act === 'needs'
      ? list.find((t) => NEEDS.has(t.state))
      : act === 'failed'
        ? list.find((t) => failed.has(t.id))
        : act === 'busy'
          ? list.find((t) => BUSY.has(t.state))
          : act === 'waiting'
            ? list.find((t) => t.state === 'background')
            : undefined) ??
    [...list].sort((x, y) => y.stateSince - x.stateSince)[0] ??
    null;

  /** A gesture on one otter between two states: 'wake' (it stretches and yawns), 'clear' (its rain cloud drifts off). @param {Otter} o @param {string} name */
  const moment = (o, name) => {
    if (o.moment) clearTimeout(o.moment);
    o.el.dataset.moment = name;
    o.moment = setTimeout(() => {
      o.moment = null;
      o.el.dataset.moment = 'none';
    }, MOMENT_MS);
  };

  const paint = () => {
    const now = Date.now();
    const raft = otters.length > 1;
    const night = isNight(new Date(now));
    // Painted again when the soonest passing mood ends, on whichever otter.
    if (cheerTimer) clearTimeout(cheerTimer);
    cheerTimer = null;
    const soonest = Math.min(Infinity, ...otters.map((o) => o.moodUntil).filter((t) => t > now));
    if (soonest !== Infinity) cheerTimer = setTimeout(paint, soonest - now + 50);
    for (const o of otters) {
      const list = agents().filter(mine(o));
      const act = activityOf(list);
      const fresh = now < o.moodUntil;
      const was = o.el.dataset.activity;
      if (was === 'asleep' && act !== 'asleep') moment(o, 'wake');
      // The cloud drifts off when the failure is over, not when something more urgent (a question) covers it.
      else if (was === 'failed' && act !== 'failed' && !list.some((t) => failed.has(t.id))) moment(o, 'clear');
      o.el.dataset.activity = act;
      o.el.dataset.night = String(night);
      o.el.dataset.mood = fresh ? o.mood : act === 'needs' ? 'worried' : act === 'failed' ? 'sad' : 'neutral';
      o.el.dataset.cheer = fresh ? o.cheer : 'none';
      o.el.dataset.long = String(act === 'busy' && list.some((t) => t.state === 'working' && now - t.stateSince >= SWEAT_MS));
      const lead = leadOf(list, act);
      o.el.dataset.hat = otterm.config.get('hats') === false ? 'none' : act === 'asleep' && night ? 'night' : lead ? lead.kind : 'none';
      const tasks = list.filter((t) => t.state === 'background').reduce((n, t) => n + backgroundCount(t.backgroundWork), 0);
      o.el.dataset.pups = String(act === 'waiting' ? Math.min(2, tasks) : 0);
      const summary = TEXT.status(counts(list, act === 'asleep'));
      const label = raft ? `${o.name}: ${summary}` : summary;
      o.el.title = `${label}\n${TEXT.hint}`;
      o.el.setAttribute('aria-label', `${TEXT.pet}. ${label}`);
    }
  };

  /** @type {ReturnType<typeof setTimeout> | null} */
  let cheerTimer = null;
  /** A passing face on one otter: happy (with its stone up, or confetti) or sad. @param {Otter} o @param {Mood} mood @param {Cheer} cheer */
  const cheerUp = (o, mood, cheer) => {
    o.mood = mood;
    o.cheer = cheer;
    o.moodUntil = Date.now() + CHEER_MS;
    paint();
  };

  // ---- The bubble and its queue: one line at a time, questions first.

  /** @type {ReturnType<typeof setTimeout> | null} */
  let showTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let wordTimer = null;

  const stopTalking = () => {
    if (wordTimer) clearInterval(wordTimer);
    wordTimer = null;
    for (const o of otters) o.el.dataset.talking = 'false';
  };

  const hideBubble = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    stopTalking();
    bubble.hidden = true;
    current = null;
  };

  /** Shows the next line that's still true, if any; in quiet hours or Do not disturb, only what you asked for. */
  const next = () => {
    hideBubble();
    if (hushed()) queue = queue.filter((q) => q.asked);
    queue = queue.filter(stillTrue);
    const s = queue.shift();
    if (!s) {
      place();
      paint();
      return;
    }
    current = s;
    s.onShown?.();
    if (s.kind !== 'status') last = s;
    const o = otterOf(s);
    cheerUp(o, s.mood, s.cheer ?? 'none');
    who.replaceChildren(h('span', { class: 'otter-pet-dot', style: { background: otterm.ui.groupColor(s.group) } }), s.name);
    const list = s.line.split(/\s+/).filter(Boolean);
    const spans = list.map((w) => h('span', { class: 'otter-pet-word' }, `${w} `));
    words.replaceChildren(...spans);
    noteText.textContent = s.note ?? '';
    act.textContent = s.action?.label ?? '';
    act.hidden = !s.action;
    extra.hidden = !s.note && !s.action;
    bubble.hidden = false;
    place();
    // The words light up at about the pace of speech while the mouth moves; the voice joins in 1.1.
    let i = 0;
    o.el.dataset.talking = 'true';
    wordTimer = setInterval(() => {
      spans[i - 1]?.classList.remove('otter-pet-on');
      if (i >= spans.length) return stopTalking();
      spans[i]?.classList.add('otter-pet-on', 'otter-pet-said');
      i += 1;
    }, 1000 / WORDS_PER_SECOND);
    const least = otterm.config.get('bubbleSeconds');
    const ms = Math.max((typeof least === 'number' && least > 0 ? least : 8) * 1000, (list.length / WORDS_PER_SECOND) * 1000 + 2500);
    showTimer = setTimeout(next, s.action ? ms + 4000 : ms);
  };

  const skip = () => {
    hideBubble();
    next();
  };

  /** Lines of a kind wait behind the kinds before them. @type {Record<Said['kind'], number>} */
  const RANK = { status: 0, needs: 0, finish: 1, hot: 1, plan: 2, break: 3 };

  /**
   * Queues a line, one per key; now: you asked for it, so it shows right away and what was showing comes back after.
   * False when quiet hours or Do not disturb keep it unsaid, so a notice can wait for them to end.
   * @param {Said} s
   * @param {boolean} [now]
   */
  const say = (s, now = false) => {
    if (!s.asked && hushed()) return false;
    queue = queue.filter((q) => q.key !== s.key);
    if (now) {
      const was = current;
      hideBubble();
      if (was && was.key !== s.key && stillTrue(was)) queue.unshift(was);
      queue.unshift(s);
      next();
      return true;
    }
    if (current?.key === s.key) hideBubble();
    const before = queue.findIndex((q) => RANK[q.kind] > RANK[s.kind]);
    if (before < 0) queue.push(s);
    else queue.splice(before, 0, s);
    if (!current) next();
    return true;
  };

  /** How the terminals of an otter are, in a line. @param {Otter} o */
  const sayStatus = (o) => {
    const list = agents().filter(mine(o));
    const raft = otters.length > 1;
    const act = activityOf(list);
    say(
      {
        key: `status:${o.key}`,
        kind: 'status',
        id: '',
        name: raft ? o.name : TEXT.pet,
        group: raft ? o.group : null,
        line: TEXT.status(counts(list, act === 'asleep')),
        mood: act === 'needs' ? 'worried' : act === 'failed' ? 'sad' : 'happy',
        otter: o.key,
        asked: true,
      },
      true,
    );
  };

  /** @param {string} id */
  const compact = (id) => {
    const t = otterm.terminal(id);
    otterm.command(id, '/compact').then(
      () => otterm.ui.toast(TEXT.compacting(t?.name ?? '')),
      (/** @type {unknown} */ e) => otterm.ui.toast(e instanceof Error ? e.message : String(e)),
    );
    skip();
  };

  /** What a full context adds under a line: how full, and a Compact button for Claude. @param {import('otterm-plugin').Terminal} t */
  const fullNote = (t) => ({
    note: TEXT.hot(otterm.context(t).text),
    action: t.kind === 'claude' ? { label: TEXT.compact, run: () => compact(t.id) } : undefined,
  });

  /** A click on an otter: the terminal it's talking about, else one of its that needs you or failed, else how they are. @param {Otter} o */
  const openSubject = (o) => {
    if (current && otterOf(current) === o) {
      const t = current.id ? otterm.terminal(current.id) : null;
      if (t) otterm.show(t.id);
      skip();
      return;
    }
    const list = agents().filter(mine(o));
    const pick = list.find((t) => NEEDS.has(t.state)) ?? list.find((t) => failed.has(t.id));
    if (pick) otterm.show(pick.id);
    else sayStatus(o);
  };

  const onTerminals = () => {
    arrange();
    const list = agents();
    const ids = new Set(list.map((t) => t.id));
    for (const m of [seen, told, endedIn, busyAt, asked]) for (const id of [...m.keys()]) if (!ids.has(id)) m.delete(id);
    for (const s of [failed, warnedFull]) for (const id of [...s]) if (!ids.has(id)) s.delete(id);
    const now = Date.now();
    for (const t of list) {
      const before = seen.get(t.id);
      seen.set(t.id, t.state);
      // One that's new since the otter came counts from its state's start, as the ones there then did.
      if (!busyAt.has(t.id)) busyAt.set(t.id, ACTIVE.has(t.state) ? now : t.stateSince);
      if (ACTIVE.has(t.state) || (before !== undefined && ACTIVE.has(before))) busyAt.set(t.id, now);
      // A failure counts until you see it, or the terminal moves on.
      if (!ENDED.has(t.state) || seenNow(t)) failed.delete(t.id);
      const isFull = full(t);
      if (!isFull) warnedFull.delete(t.id);
      // A question that wasn't told yet: it just asked, or asks something else (trust the folder, then a permission),
      // even when one update carries both.
      const asks = NEEDS.has(t.state) && asked.get(t.id) !== t.stateSince;
      if (asks) asked.set(t.id, t.stateSince);
      if (!asks && (before === undefined || before === t.state)) {
        if (ENDED.has(t.state)) endedIn.set(t.id, t.state);
        continue;
      }
      const again = endedIn.get(t.id) === 'background' && told.get(t.id) === t.lastMessage;
      const finished = before !== undefined && ENDED.has(t.state) && !ENDED.has(before) && !again;
      if (ENDED.has(t.state)) endedIn.set(t.id, t.state);
      // A notice (the usage limit, an API error) isn't Claude's answer: nothing to say, nothing to cheer.
      const notice = finished && isNotice(t.lastMessage);
      const reply = finished ? speakable(t.lastMessage) : '';
      if (finished) {
        told.set(t.id, t.lastMessage);
        if (reply && moodFor(reply) === 'sad' && !seenNow(t)) failed.add(t.id);
      }
      if (lookedAt(t)) continue;
      if (asks) {
        const line = `${ASKS[t.state] ?? TEXT.needsYou}.`;
        say({ key: t.id, kind: 'needs', id: t.id, name: t.name, group: t.group, line, mood: 'worried', state: t.state, stateSince: t.stateSince, msg: null });
      } else if (finished && !notice) {
        const mode = otterm.config.get('say');
        const line = mode === 'nothing' ? '' : mode === 'name' ? TEXT.finished : reply || TEXT.finished;
        const mood = reply ? moodFor(reply) : 'happy';
        const cheer = !reply || mood === 'sad' ? 'none' : cheerFor(reply);
        const note = isFull && warnFull() && !warnedFull.has(t.id) ? fullNote(t) : null;
        if (line) {
          const onShown = note ? () => warnedFull.add(t.id) : undefined;
          say({ key: t.id, kind: 'finish', id: t.id, name: t.name, group: t.group, line, mood, cheer, state: t.state, stateSince: t.stateSince, msg: t.lastMessage, ...note, onShown });
        } else {
          cheerUp(otterOfGroup(t.group), mood, cheer);
        }
      }
    }
    tellFull();
    // A line about a terminal that has moved on (you answered, it's working again, you opened it) goes unsaid.
    queue = queue.filter(stillTrue);
    if (current && !stillTrue(current)) next();
    paint();
  };

  // ---- Its other notices: a full context said on its own, the 5-hour limit, and a break. Each is marked told only
  // once it's said, so quiet hours and Do not disturb make it wait, not vanish; the tick looks again.

  /** A terminal at its prompt with a full context that a finish didn't tell (it filled while you looked, or the bubble says nothing on a finish). */
  const tellFull = () => {
    if (!warnFull()) return;
    for (const t of agents()) {
      if (!AT_PROMPT.has(t.state) || warnedFull.has(t.id) || !full(t) || lookedAt(t)) continue;
      if (current?.key === t.id || queue.some((q) => q.key === t.id)) continue;
      const { note, action } = fullNote(t);
      say({ key: t.id, kind: 'hot', id: t.id, name: t.name, group: t.group, line: note, mood: 'worried', action, onShown: () => warnedFull.add(t.id) });
    }
  };

  const onPlan = () => {
    const limit = otterm.config.get('planWarn');
    const p = otterm.plan();
    if (typeof limit !== 'number' || limit <= 0 || !p || p.fiveHourPct === null || p.fiveHourPct < limit) return;
    // Once per 5-hour window, on this device; without its reset time, per 5 hours of the clock.
    const window5h = p.fiveHourResetsAt ?? `clock-${Math.floor(Date.now() / (5 * 3_600_000))}`;
    if (otterm.store.get('planWarned') === window5h || current?.key === 'plan' || queue.some((q) => q.key === 'plan')) return;
    const resets = p.fiveHourResetsAt ? new Date(p.fiveHourResetsAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const line = TEXT.planNear(`${Math.round(p.fiveHourPct)}%`, resets);
    say({ key: 'plan', kind: 'plan', id: '', name: TEXT.plan, group: null, line, mood: 'worried', onShown: () => otterm.store.set('planWarned', window5h) });
  };

  let lastInput = Date.now();
  let streakFrom = Date.now();
  // Only when you last pressed a key or clicked on this page, never which key: a gap of 10 minutes is a break.
  const onInput = () => {
    const now = Date.now();
    if (now - lastInput > BREAK_GAP_MS) streakFrom = now;
    lastInput = now;
  };
  const breakDue = () => {
    const every = otterm.config.get('breakAfter');
    const now = Date.now();
    if (typeof every !== 'number' || every <= 0 || now - lastInput > BREAK_GAP_MS || now - streakFrom < every * 60_000) return;
    if (current?.key === 'break' || queue.some((q) => q.key === 'break')) return;
    say({ key: 'break', kind: 'break', id: '', name: TEXT.pet, group: null, line: TEXT.pause(every), mood: 'happy', onShown: () => (streakFrom = Date.now()) });
  };

  /** The otter under the pointer. @param {EventTarget | null} target */
  const otterAt = (target) => {
    const el = target instanceof Element ? target.closest('.otter-pet-one') : null;
    return otters.find((o) => o.el === el) ?? null;
  };
  const speakerOtter = () => (current ? otterOf(current) : otters[0]);

  // ---- Stroking it with the mouse, without pressing: it closes its eyes, pleased, and hearts rise (a cat purrs).

  /**
   * The otter being stroked: how far the hand has gone over it, and its turns. Per axis (x, y): which way it last went
   * and how far.
   * @typedef {{ otter: Otter | null, dist: number, x: number, y: number, dirs: number[], runs: number[], turns: number }} Stroke
   */
  /** A new stroke, on an otter or on none. @param {Otter | null} [otter] @param {PointerEvent} [e] @returns {Stroke} */
  const stroke = (otter = null, e) => ({ otter, dist: 0, x: e?.clientX ?? 0, y: e?.clientY ?? 0, dirs: [0, 0], runs: [0, 0], turns: 0 });
  let pet = stroke();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let petTimer = null;
  const unpet = () => {
    if (petTimer) clearTimeout(petTimer);
    petTimer = null;
    if (pet.otter) pet.otter.el.dataset.petted = 'false';
    pet = stroke();
  };
  /** @param {PointerEvent} e */
  const onHover = (e) => {
    if (press || e.buttons || e.pointerType === 'touch') return;
    const o = otterAt(e.target);
    if (o !== pet.otter) {
      unpet();
      if (o) pet = stroke(o, e);
      return;
    }
    if (!o) return;
    const step = [e.clientX - pet.x, e.clientY - pet.y];
    step.forEach((d, i) => {
      const dir = Math.sign(d);
      if (!dir) return;
      if (dir !== pet.dirs[i]) {
        if (pet.dirs[i] && pet.runs[i] >= PET_RUN_PX) pet.turns += 1;
        pet.dirs[i] = dir;
        pet.runs[i] = 0;
      }
      pet.runs[i] += Math.abs(d);
    });
    pet.dist += Math.hypot(step[0], step[1]);
    pet.x = e.clientX;
    pet.y = e.clientY;
    if (pet.dist >= PET_PX && pet.turns >= 2) o.el.dataset.petted = 'true';
    if (petTimer) clearTimeout(petTimer);
    petTimer = setTimeout(unpet, PET_END_MS);
  };

  // ---- Pressing it: a click opens, a drag moves the raft, a long press or a right-click opens the menu.

  /** @type {{ x: number, y: number, left: number, top: number, pointer: number, moved: boolean, long: boolean, otter: Otter | null, timer: ReturnType<typeof setTimeout>, lastX: number, lastT: number } | null} */
  let press = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let swingTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let landTimer = null;
  /** It hangs from where you hold it: tilted by how fast it's pulled sideways, back to straight when the hand stops. @param {number} deg */
  const swing = (deg) => {
    if (swingTimer) clearTimeout(swingTimer);
    swingTimer = deg ? setTimeout(() => swing(0), 120) : null;
    root.style.setProperty('--otter-pet-swing', `${deg.toFixed(1)}deg`);
  };
  /** Put down: a bump, and a splash where it lands. */
  const land = () => {
    swing(0);
    if (landTimer) clearTimeout(landTimer);
    root.classList.add('otter-pet-landed');
    landTimer = setTimeout(() => {
      landTimer = null;
      root.classList.remove('otter-pet-landed');
    }, LAND_MS);
  };
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
    const otter = otterAt(e.target);
    const timer = setTimeout(() => {
      if (!press || press.moved) return;
      press.long = true;
      press.otter?.el.classList.remove('otter-pet-pressed');
      openMenu(press.x, press.y, press.otter ?? speakerOtter());
    }, LONG_PRESS_MS);
    press = { x: e.clientX, y: e.clientY, left: root.offsetLeft, top: root.offsetTop, pointer: e.pointerId, moved: false, long: false, otter, timer, lastX: e.clientX, lastT: e.timeStamp };
    unpet();
    otter?.el.classList.add('otter-pet-pressed');
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the press still works, only without the capture.
    }
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (!press || e.pointerId !== press.pointer || press.long) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!press.moved) {
      clearTimeout(press.timer);
      press.otter?.el.classList.remove('otter-pet-pressed');
      root.classList.add('otter-pet-dragging');
      // The raft hangs from where you hold it.
      root.style.setProperty('--otter-pet-hold', `${Math.round(press.x - row.getBoundingClientRect().left)}px`);
    }
    press.moved = true;
    const speed = (e.clientX - press.lastX) / Math.max(1, e.timeStamp - press.lastT);
    press.lastX = e.clientX;
    press.lastT = e.timeStamp;
    swing(Math.max(-SWING_MAX, Math.min(SWING_MAX, speed * SWING_GAIN)));
    const r = room();
    at = { fx: r.w ? (press.left + dx - MARGIN) / r.w : 1, fy: r.h ? (press.top + dy - MARGIN) / r.h : 1 };
    place();
  };
  /** @param {PointerEvent} e */
  const onUp = (e) => {
    if (!press || e.pointerId !== press.pointer) return;
    const { moved, long, otter, timer } = press;
    clearTimeout(timer);
    press = null;
    otter?.el.classList.remove('otter-pet-pressed');
    root.classList.remove('otter-pet-dragging');
    if (moved) {
      at = { fx: Math.min(1, Math.max(0, at.fx)), fy: Math.min(1, Math.max(0, at.fy)) };
      otterm.store.set('at', at);
      // Put down, it splashes; a drag the browser took over (a system gesture) only stops swinging.
      if (e.type === 'pointerup') land();
      else swing(0);
    } else if (!long && e.type === 'pointerup') {
      openSubject(otter ?? speakerOtter());
    }
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('pointermove', onHover);
  root.addEventListener('pointerleave', unpet);
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (press) {
      clearTimeout(press.timer);
      press.long = true;
    }
    const o = otterAt(e.target) ?? speakerOtter();
    // From the keyboard (the menu key, Shift+F10) there's no pointer: under the otter.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = o.el.getBoundingClientRect();
      openMenu(r.left, r.bottom, o);
    } else {
      openMenu(e.clientX, e.clientY, o);
    }
  });
  root.addEventListener('keydown', (e) => {
    const o = otterAt(e.target);
    if (!o) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSubject(o);
    } else if (e.key === 'Escape') {
      skip();
    }
  });
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    skip();
  });
  act.addEventListener('click', (e) => {
    e.stopPropagation();
    current?.action?.run();
  });

  // ---- The menu. Its choices (size, one otter or a raft, Do not disturb) are kept on this device; Settings has the
  // defaults.

  /** The otter the menu was opened on. @type {Otter | null} */
  let menuFor = null;
  /** A long press opens the menu under the finger: the tap that ends it mustn't pick an item. */
  let menuSince = 0;
  const menuItems = () => /** @type {HTMLButtonElement[]} */ ([...menu.querySelectorAll('button:not(:disabled)')]);
  /** @param {PointerEvent} e */
  const onOutside = (e) => {
    if (!(e.target instanceof Node) || !menu.contains(e.target)) closeMenu(false);
  };
  /** @param {boolean} refocus */
  const closeMenu = (refocus) => {
    if (menu.hidden) return;
    menu.hidden = true;
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) menuFor?.el.focus();
    menuFor = null;
  };
  const time = (/** @type {number} */ ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  /** @param {number} until */
  const quiet = (until) => {
    otterm.store.set('dnd', until);
    if (until > Date.now()) {
      queue = queue.filter((q) => q.asked);
      if (current && !current.asked) next();
    }
  };

  /** @param {number} x @param {number} y @param {Otter} o */
  const openMenu = (x, y, o) => {
    closeMenu(false);
    menuFor = o;
    /** Back to the otter from the keyboard (a click from the keyboard has no detail), not after a mouse click. @param {() => void} run */
    const pick = (run) => (/** @type {MouseEvent} */ e) => {
      if (Date.now() - menuSince < 350) return;
      closeMenu(e.detail === 0);
      run();
    };
    /** @param {string} label @param {() => void} run @param {boolean} [disabled] */
    const item = (label, run, disabled = false) => h('button', { class: 'otter-pet-item', type: 'button', role: 'menuitem', disabled, onclick: pick(run) }, label);
    /** @param {string} label @param {[string, boolean, () => void][]} options */
    const chips = (label, options) =>
      h(
        'div',
        { class: 'otter-pet-choice', role: 'group', 'aria-label': label },
        h('span', { class: 'otter-pet-choice-label' }, label),
        ...options.map(([text, on, run]) =>
          h('button', { class: 'otter-pet-chip', type: 'button', role: 'menuitemradio', 'aria-checked': String(on), onclick: pick(run) }, text),
        ),
      );
    const sep = () => h('div', { class: 'otter-pet-sep', role: 'separator' });
    const list = agents().filter(mine(o));
    const opens = [
      ...list.filter((t) => NEEDS.has(t.state)).map((t) => ({ t, why: ASKS[t.state] ?? TEXT.needsYou })),
      ...list.filter((t) => failed.has(t.id)).map((t) => ({ t, why: TEXT.failed })),
    ].slice(0, 4);
    const size = choice('size', ['medium', 'small', 'large']);
    const resize = (/** @type {string} */ v) => () => {
      otterm.store.set('size', v);
      place();
    };
    const regroup = (/** @type {string} */ v) => () => {
      otterm.store.set('otters', v);
      arrange();
      place();
      paint();
    };
    const until = dndUntil();
    const kids = [
      item(TEXT.menu.status, () => sayStatus(o)),
      item(TEXT.menu.again, () => (last ? say({ ...last, asked: true, onShown: undefined }, true) : undefined), !last),
      ...opens.map(({ t, why }) => item(TEXT.menu.open(t.name, why), () => otterm.show(t.id))),
      sep(),
      until > Date.now()
        ? item(TEXT.menu.dndOff(time(until)), () => quiet(0))
        : chips(TEXT.menu.dnd, [
            [TEXT.menu.m30, false, () => quiet(Date.now() + 30 * 60_000)],
            [TEXT.menu.h1, false, () => quiet(Date.now() + 60 * 60_000)],
            [TEXT.menu.tomorrow, false, () => quiet(nextMorning(new Date()))],
          ]),
      chips(
        TEXT.menu.size,
        ['small', 'medium', 'large'].map((v) => /** @type {[string, boolean, () => void]} */ ([TEXT.menu.sizes[v], size === v, resize(v)])),
      ),
      otterm.phone
        ? null
        : chips(TEXT.menu.otters, [
            [TEXT.menu.one, mode() === 'one', regroup('one')],
            [TEXT.menu.group, mode() === 'group', regroup('group')],
          ]),
      chips(
        TEXT.menu.character,
        ANIMAL_KEYS.map((v) =>
          /** @type {[string, boolean, () => void]} */ ([
            TEXT.menu.animals[v] ?? v,
            drawn === v,
            () => {
              otterm.store.set('character', v);
              redraw();
              paint();
            },
          ]),
        ),
      ),
      item(TEXT.menu.corner, () => {
        at = { fx: 1, fy: 1 };
        otterm.store.set('at', at);
        place();
      }),
    ];
    menu.replaceChildren(...kids.filter((k) => k !== null));
    menu.hidden = false;
    menuSince = Date.now();
    const w = menu.offsetWidth;
    const hh = menu.offsetHeight;
    menu.style.left = `${Math.round(Math.max(8, Math.min(x, window.innerWidth - w - 8)))}px`;
    menu.style.top = `${Math.round(y + hh > window.innerHeight - 8 ? Math.max(8, y - hh) : y)}px`;
    menuItems()[0]?.focus();
    document.addEventListener('pointerdown', onOutside, true);
  };
  menu.addEventListener('keydown', (e) => {
    const items = menuItems();
    const i = items.findIndex((b) => b === document.activeElement);
    const go = (/** @type {number} */ k) => {
      e.preventDefault();
      items[(k + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeMenu(true);
    }
  });

  // ---- Wiring.

  const onResize = () => {
    closeMenu(false);
    place();
  };
  const onBlur = () => closeMenu(false);
  arrange();
  place();
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onBlur);
  // Coming back to the window counts as looking at the terminal that has the keyboard.
  window.addEventListener('focus', onTerminals);
  document.addEventListener('visibilitychange', onTerminals);
  document.addEventListener('pointerdown', onInput, { capture: true, passive: true });
  document.addEventListener('keydown', onInput, { capture: true, passive: true });
  const offs = [
    otterm.on('terminals', onTerminals),
    otterm.on('focus', onTerminals),
    otterm.on('plan', onPlan),
    otterm.on('layout', () => {
      arrange();
      place();
    }),
    otterm.config.onChange(() => {
      redraw();
      arrange();
      place();
      paint();
    }),
  ];
  // Moods wear off, sleep and sweat come, and breaks fall due without any event, so it looks again now and then.
  const tick = setInterval(() => {
    paint();
    tellFull();
    onPlan();
    breakDue();
  }, 5000);
  onPlan();
  paint();

  return () => {
    clearInterval(tick);
    if (cheerTimer) clearTimeout(cheerTimer);
    if (press) clearTimeout(press.timer);
    for (const t of [swingTimer, landTimer, petTimer, ...otters.map((o) => o.moment)]) if (t) clearTimeout(t);
    for (const off of offs) off();
    hideBubble();
    closeMenu(false);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onTerminals);
    document.removeEventListener('visibilitychange', onTerminals);
    document.removeEventListener('pointerdown', onInput, true);
    document.removeEventListener('keydown', onInput, true);
    root.remove();
    menu.remove();
  };
}
