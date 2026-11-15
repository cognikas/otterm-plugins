# Otterm plugins

The catalog of reviewed plugins for [Otterm](https://github.com/cognikas/otterm-installers). Otterm reads
`catalog.json` from here, downloads a plugin's files from the commit it names, and checks each file's SHA-256
before using it. New versions reach every Otterm that has the plugin, without a restart.

## Adding or updating a plugin

1. Put it in `plugins/<id>/`: `otterm-plugin.json`, its `main.js` and any styles. The id is lower-case letters,
   digits and dashes, and matches the folder.
2. Check it here first: `npm ci` once, then `npm run check` (ESLint with the rules below, and every manifest).
3. A new version needs a higher `version` in `otterm-plugin.json`.
4. Open a pull request. A maintainer reviews it, looking hardest at what its `permissions` allow (typing into
   terminals, reading their screens, reading Claude's conversations), and merges it.
5. The pull request is checked with main's rules. On merge, the `catalog` workflow checks every plugin and writes `catalog.json`.

Otterm's **New plugin…** (Settings → Extensions) makes a plugin from a template with a Claude terminal, and
**Publish…** opens the pull request here.

## What a plugin is written in

Plain JavaScript modules: Otterm loads the files here as they are, so there is no build step, and a plugin imports
nothing (no packages, so no npm or pnpm either): everything comes through `otterm`. For types, the template's
JSDoc points at Otterm's plugin API, so an editor checks it like TypeScript. A plugin written in TypeScript is
welcome too: commit the JavaScript it compiles to, which is what Otterm runs and what is reviewed.

## Rules for plugins

`eslint.config.mjs` checks these on every pull request; a maintainer still reads every one.

- Everything through the plugin API (`activate(otterm)`): no imports, no network (`fetch`, `WebSocket` and the
  like), no `eval` or `new Function`, no HTML from strings (`innerHTML` and the like; build elements with
  `otterm.ui.h`), no script or iframe elements, no `window.open`, and data in `otterm.store`, not `localStorage`.
- Ask only for the permissions it needs.
- Text in the interface is plain English, short, and says what it does.
