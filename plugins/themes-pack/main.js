// Themes pack: more looks for Otterm beside its dark one and Look's light one. Each sets the page's colors (in
// styles.css, by the theme's name on the page) and the terminals' colors (here). It reads and changes nothing else.

/** The terminals' colors for each theme. */
/** @type {Record<string, import('otterm-plugin').TerminalTheme>} */
export const THEMES = {
  contrast: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    cursorAccent: '#000000',
    selectionBackground: '#3d6fd6aa',
    selectionForeground: '#ffffff',
    black: '#000000',
    red: '#ff5c5c',
    green: '#3ddc6b',
    yellow: '#ffd23f',
    blue: '#5ea8ff',
    magenta: '#e07bff',
    cyan: '#3ee8d4',
    white: '#e6e6e6',
    brightBlack: '#8c8c8c',
    brightRed: '#ff8a8a',
    brightGreen: '#7cf29a',
    brightYellow: '#ffe680',
    brightBlue: '#97c5ff',
    brightMagenta: '#f0aaff',
    brightCyan: '#8ef0de',
    brightWhite: '#ffffff',
  },
  warm: {
    background: '#161210',
    foreground: '#ece3d6',
    cursor: '#e8a35c',
    cursorAccent: '#161210',
    selectionBackground: '#5a4a3aaa',
    black: '#2b2420',
    red: '#e5584f',
    green: '#8fbf5a',
    yellow: '#e6c05c',
    blue: '#7fa6c9',
    magenta: '#c98bb4',
    cyan: '#7fbfae',
    white: '#d8cfc2',
    brightBlack: '#6b5f53',
    brightRed: '#f07a70',
    brightGreen: '#a9d47a',
    brightYellow: '#f2d47e',
    brightBlue: '#a0c0dc',
    brightMagenta: '#dcaacb',
    brightCyan: '#a3d6c8',
    brightWhite: '#f6efe4',
  },
  soft: {
    background: '#fbf8f2',
    foreground: '#2d2a26',
    cursor: '#2d2a26',
    cursorAccent: '#fbf8f2',
    selectionBackground: '#d9c9a399',
    black: '#2d2a26',
    red: '#b0302a',
    green: '#3d7a2e',
    yellow: '#8a6410',
    blue: '#2f5f9e',
    magenta: '#80428f',
    cyan: '#1f6f6a',
    white: '#7b746a',
    brightBlack: '#5a544c',
    brightRed: '#922620',
    brightGreen: '#2f5f23',
    brightYellow: '#6e500c',
    brightBlue: '#244b80',
    brightMagenta: '#663373',
    brightCyan: '#185956',
    brightWhite: '#9b9488',
  },
};

/**
 * The theme a setting names, or the first one.
 * @param {unknown} name
 */
export function pick(name) {
  return typeof name === 'string' && Object.hasOwn(THEMES, name) ? name : 'contrast';
}

/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) {
  const root = document.documentElement;
  const apply = () => {
    const name = pick(otterm.config.get('theme'));
    root.dataset.ottermTheme = name;
    otterm.ui.terminalTheme(THEMES[name]);
  };
  apply();
  const off = otterm.config.onChange(apply);
  return () => {
    off();
    delete root.dataset.ottermTheme;
  };
}
