# Otter pet

An otter that floats over Otterm's window. Drag it anywhere: it stays there, on this device, when the window is
resized.

- **Its face shows how the terminals are doing.** It taps its stone while a Claude or Codex terminal works, looks
  around while one waits on its own background work, hops with worried brows while one waits on you, and falls
  asleep when none has worked for a while (15 minutes; change it, or turn it off, in Settings).
- **A bubble says what finished**, for the terminals you aren't looking at: the terminal's name with its group's
  color, then the first sentence of Claude's reply, its words lighting up at about the pace of speech. Questions go
  first (a permission, trusting a folder or its hooks), then the finishes, one at a time. A line about a terminal that
  has moved on (you answered it, it's working again, you opened it) is dropped unsaid. Notices that aren't Claude's
  answer, such as the usage limit, are left out. A failure gets a sad face, anything else a happy one.
- **A click opens the terminal it's talking about**; with nothing to say, the one that needs you, else the one that
  finished last. × or Esc dismisses the bubble. It works from the keyboard too (Tab to it, Enter).
- **On a paired phone or laptop** it shows too, a bit smaller, and drags by touch (switch it off in Settings).

## Settings

| Setting | What it does |
| --- | --- |
| Tell me about | The terminals you aren't looking at (the default), or every terminal. When Otterm isn't the window in front, every terminal counts as not looked at |
| When a terminal finishes, the bubble shows | The first sentence of the reply, only which terminal finished, or nothing (the otter only smiles) |
| Keep each bubble at least | 8 s by default; a long line stays as long as it takes to read |
| Size | Small, medium or large |
| Falls asleep when no terminal has worked for | 15 min by default; empty to stay awake |
| Quiet hours | No bubbles between two times, such as `22:00-08:00`; the face still shows how things are |
| Show it on paired phones and laptops too | On by default |

It asks for no permissions: it reads the terminals' states and the first line of Claude's last reply, which every
plugin may read.

## How it floats, and its voice

Plugin API 1 has no floating layer, so the otter adds its own element to the page (above the panes, below Otterm's
dialogs, popovers and toasts) and removes it when it's switched off, updated or reloaded.

**Version 1.1 will talk**, with [chimera](https://github.com/jamesondh/chimera-vocal-synth)'s voice, the mouth
and the bubble following each word. It needs three things from Otterm, asked for in
[cognikas/otterm#19](https://github.com/cognikas/otterm/issues/19): loading a `.wasm` from the plugin's folder, a
worker of its own (making a line takes 0.5–2.6 s, too long for the window's main thread), and a `sound` permission.
With the issue's floating layer it will also move there, and with the whole last reply it will find the first
sentence when it isn't on the first line.

## Credits

The otter and the way it turns a reply into one line come from Willy's spike of 2026-11-12, in which chimera's voice
said real Claude endings.
