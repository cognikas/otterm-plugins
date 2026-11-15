// The rules every plugin's JavaScript passes before it enters the catalog. They catch mistakes and make review
// easier; they don't make a plugin safe on their own, so a maintainer still reads every pull request.
import js from '@eslint/js';
import globals from 'globals';

const THROUGH_OTTERM = 'Plugins have no network and import nothing: everything comes through otterm.';
const OWN_STORE = 'Use otterm.store, which keeps each plugin’s data apart.';
const NO_HTML = 'No HTML from strings: build elements with otterm.ui.h, and text with otterm.ui.markdown.';
const GLOBAL_OBJECTS = ['window', 'globalThis', 'self', 'top', 'parent'];

export default [
  { ignores: ['**/node_modules/**'] },
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
  {
    files: ['plugins/**/*.js', 'plugins/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    // No eslint-disable comments in a plugin: the rules are the same for every one.
    linterOptions: { noInlineConfig: true },
    rules: {
      ...js.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-warning-comments': ['error', { terms: ['@ts-nocheck', '@ts-ignore', '@ts-expect-error'], location: 'anywhere' }],
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts'].map((name) => ({ name, message: THROUGH_OTTERM })),
        ...['localStorage', 'sessionStorage', 'indexedDB', 'caches'].map((name) => ({ name, message: OWN_STORE })),
        { name: 'open', message: 'Links open through Otterm (an <a> with href), not window.open.' },
      ],
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc'].map((property) => ({ property, message: NO_HTML })),
        ...['write', 'writeln'].map((property) => ({ object: 'document', property, message: NO_HTML })),
        { object: 'document', property: 'cookie', message: OWN_STORE },
        ...GLOBAL_OBJECTS.flatMap((object) => [
          ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker'].map((property) => ({ object, property, message: THROUGH_OTTERM })),
          ...['localStorage', 'sessionStorage', 'indexedDB', 'caches'].map((property) => ({ object, property, message: OWN_STORE })),
          { object, property: 'open', message: 'Links open through Otterm (an <a> with href), not window.open.' },
          { object, property: 'eval', message: 'No eval.' },
        ]),
        { object: 'navigator', property: 'sendBeacon', message: THROUGH_OTTERM },
        { object: 'navigator', property: 'serviceWorker', message: THROUGH_OTTERM },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportDeclaration', message: THROUGH_OTTERM },
        { selector: 'ImportExpression', message: THROUGH_OTTERM },
        { selector: 'ExportNamedDeclaration[source], ExportAllDeclaration', message: THROUGH_OTTERM },
        {
          selector: `MemberExpression[computed=true][property.type!='Literal'][object.name=/^(${GLOBAL_OBJECTS.join('|')}|document|navigator)$/]`,
          message: 'Name what you use from window, document or navigator, so a reviewer can see it.',
        },
        { selector: "CallExpression[callee.property.name=/^(createContextualFragment|parseFromString)$/]", message: NO_HTML },
        { selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(on|srcdoc$)/i]", message: 'No inline handlers: use addEventListener, or h()’s on… props.' },
        { selector: "CallExpression[callee.property.name='createElement'][arguments.0.value=/^(script|iframe|object|embed|base|meta|link)$/i]", message: 'No script, iframe, object, embed, base, meta or link elements.' },
      ],
    },
  },
];
