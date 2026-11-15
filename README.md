# Otterm plugins

The catalog of reviewed plugins for [Otterm](https://github.com/cognikas/otterm-installers). Otterm reads
`catalog.json` from here, downloads a plugin's files from the commit it names, and checks each file's SHA-256
before using it. New versions reach every Otterm that has the plugin, without a restart.

## Adding or updating a plugin

1. Put it in `plugins/<id>/`: `otterm-plugin.json`, its `main.js` and any styles. The id is lower-case letters,
   digits and dashes, and matches the folder.
2. A new version needs a higher `version` in `otterm-plugin.json`.
3. Open a pull request. A maintainer reviews it, looking hardest at what its `permissions` allow (typing into
   terminals, reading their screens, reading Claude's conversations), and merges it.
4. On merge, the `catalog` workflow checks every plugin and writes `catalog.json`.

Otterm's **New plugin…** (Settings → Extensions) makes a plugin from a template with a Claude terminal, and
**Publish…** opens the pull request here.

## Rules for plugins

- Everything through the plugin API (`activate(otterm)`); no network requests, no `eval`, no `innerHTML` with text
  from terminals or conversations.
- Ask only for the permissions it needs.
- Text in the interface is plain English, short, and says what it does.
