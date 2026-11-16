# Otterm plugins

The catalog of reviewed plugins for [Otterm](https://github.com/cognikas/otterm-installers). Otterm reads
[`catalog.json`](https://cognikas.github.io/otterm-plugins/catalog.json), which this repo's workflow publishes on
GitHub Pages from `main`, downloads a plugin's files from the commit it names, and checks each file's SHA-256
before using it. New versions reach every Otterm that has the plugin, without a restart.

## Adding or updating a plugin

1. Put it in `plugins/<id>/`: `otterm-plugin.json`, its `main.js` and any styles. The id is lower-case letters,
   digits and dashes, and matches the folder.
2. Check it here first: `npm ci` once, then `npm run check`: ESLint with the rules below, the types, and every
   manifest against its schema.
3. A new version needs a higher `version` in `otterm-plugin.json`.
4. Open a pull request. A maintainer reviews it, looking hardest at what its `permissions` allow (typing into
   terminals, reading their screens, reading Claude's conversations), and merges it.
5. The pull request is checked with main's rules, and `main` takes nothing else: no direct pushes, and a code
   owner's review. On merge, the `catalog` workflow checks every plugin again and publishes `catalog.json` on GitHub
   Pages, which only `main` can do.

Otterm's **New plugin…** (Settings → Extensions) makes a plugin from a template with a Claude terminal, and
**Publish…** opens the pull request here.

## What a plugin is written in

Plain JavaScript modules: Otterm loads the files here as they are, so there is no build step, and a plugin imports
nothing (no packages, so no npm or pnpm either): everything comes through `otterm`. A plugin written in
TypeScript is welcome too: commit the JavaScript it compiles to, which is what Otterm runs and what is reviewed.

## Types

`types/otterm-plugin.d.ts` is the plugin API, version 1: what Otterm promises plugins, with every member
commented. Otterm's build checks its own code against it, and the `catalog` workflow type-checks every plugin
against it (TypeScript, strict, on the JavaScript), reading `import('otterm-plugin')` in JSDoc as this file:

```js
/** @param {import('otterm-plugin').Otterm} otterm */
export function activate(otterm) { … }
```

`types/otterm-plugin.schema.json` is `otterm-plugin.json`'s schema; a manifest names it in `$schema` for editors.
Both come from Otterm (its plugin kit, which New plugin… copies into a plugin's folder) and change here when a new
Otterm adds to the API. They may become an npm package once the API has settled.

## Rules for plugins

`eslint.config.mjs` checks these on every pull request; a maintainer still reads every one.

- Everything through the plugin API (`activate(otterm)`): no imports, no network (`fetch`, `WebSocket` and the
  like), no `eval` or `new Function`, no HTML from strings (`innerHTML` and the like; build elements with
  `otterm.ui.h`), no script or iframe elements, no `window.open`, and data in `otterm.store`, not `localStorage`.
- Ask only for the permissions it needs.
- Text in the interface is plain English, short, and says what it does.

## License

Everything here is under the [MIT license](LICENSE): the plugins, the types and the tools. A pull request that adds or
changes a plugin publishes it under the MIT license. Otterm's plugin API is MIT as well, so a plugin can use any
license.
