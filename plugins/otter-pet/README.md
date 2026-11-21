# Otter pet

An otter that floats over Otterm's window. Drag it anywhere: it stays there, on this device, when the window is
resized.

## What it does

**What it does shows how the terminals are doing**, the most urgent first:

| When | The otter |
| --- | --- |
| A terminal needs you (a permission, trusting a folder or its hooks) | A "!" over its head, worried brows; it hops and waves |
| One failed (its last reply reads as a failure) and you haven't looked at it yet | Sad brows, drooping ears, a tear |
| One works | Types on a little laptop; after 10 minutes of it, it sweats |
| One waits on its own background work (a dev server, a subagent) | Juggles its stone, its eyes following it |
| Nothing going on | Breathes and blinks |
| No terminal has worked for a while (15 minutes; change it, or turn it off, in Settings) | Floats asleep on its back, z's rising |
| One just finished well | Happy eyes and a hop, its stone held up golden; confetti when the tests pass or something was merged or shipped |

**A bubble says what finished**, for the terminals you aren't looking at: the terminal's name with its group's color,
then the first sentence of Claude's reply, its words lighting up at about the pace of speech. Questions go first (a
permission, trusting a folder or its hooks), then the finishes, one at a time. A line about a terminal that has moved
on (you answered it, it's working again, you opened it) is dropped unsaid. Notices that aren't Claude's answer, such
as the usage limit, are left out.

**It tells you a few other things**, each of which can be turned off in Settings:

- A terminal's context is nearly full (Otterm shows it in red): with a **Compact** button for Claude, which sends
  `/compact` the safe way, only while Claude waits at its prompt with an empty input box.
- You've used 90% of the 5-hour limit, once per window, with when it resets.
- You've been at it for 90 minutes: time for a short break. It counts while you type or click in Otterm; 10 minutes
  away is a break.

**A click opens the terminal it's talking about**; with nothing to say, the one that needs you or failed, else it
says how they are. × or Esc dismisses the bubble. It works from the keyboard too: Tab to it, Enter; the menu key or
Shift+F10 opens its menu.

**Its menu** (right-click it, or hold it on a touch screen): how they are, say the last one again, open the one that
needs you or failed, Do not disturb (30 minutes, an hour, or until tomorrow at 8), its size, one otter or one per
group, and back to the corner. What you pick there is kept on that device; Settings has the defaults.

**One otter per group**, if you like: a raft, each otter with a scarf in its group's color, showing how its group is
doing, and the bubble points at the one that speaks. Up to six otters; more groups share the last one. Not on phones.

**On a paired phone or laptop** it shows too, a bit smaller, drags by touch and opens its menu with a long press
(switch it off in Settings).

## Settings

| Setting | What it does |
| --- | --- |
| Tell me about | The terminals you aren't looking at (the default), or every terminal. When Otterm isn't the window in front, every terminal counts as not looked at |
| When a terminal finishes, the bubble shows | The first sentence of the reply, only which terminal finished, or nothing (the otter only smiles) |
| Keep each bubble at least | 8 s by default; a long line stays as long as it takes to read |
| Otters | One for every terminal (the default), or one per group, in a raft. Each device can pick its own in the menu |
| Size | Small, medium or large. Each device can pick its own in the menu |
| Falls asleep when no terminal has worked for | 15 min by default; empty to stay awake |
| Tell me when a terminal's context is nearly full | On by default |
| Tell me when the 5-hour limit is used up to | 90% by default; empty for no warning |
| Suggest a break after working for | 90 min by default; empty for no reminder |
| Quiet hours | No bubbles between two times, such as `22:00-08:00`; the otter still shows how things are |
| Show it on paired phones and laptops too | On by default |

It asks for one permission, **type**, only for the Compact button: Otterm's `command()` types `/compact` only into an
empty input box while Claude waits at its prompt, and presses Enter only once the box shows exactly that. Everything
else reads what every plugin may read: the terminals' states and context, the first line of Claude's last reply, and
the plan's usage. For the break it notes when you last pressed a key or clicked on the page, never which key.

## How it floats, and its voice

Plugin API 1 has no floating layer, so the otter adds its own elements to the page (above the panes, below Otterm's
dialogs, popovers and toasts; its menu just above it) and removes them when it's switched off, updated or reloaded.

**Version 1.1 will talk**, with [chimera](https://github.com/jamesondh/chimera-vocal-synth)'s voice, the mouth
and the bubble following each word, and a way to mute it in the menu. It needs Otterm 0.5.1's loading of a `.wasm`
from the plugin's folder, a worker of its own (making a line takes 0.5–2.6 s, too long for the window's main thread)
and the `sound` permission ([cognikas/otterm#20](https://github.com/cognikas/otterm/issues/20)). With 0.5.1's
floating layer it will also move there, with the whole last reply it will find the first sentence when it isn't on
the first line, and with knowing which device you're at it will speak only there.

## Credits

The otter and the way it turns a reply into one line come from Willy's spike of 2026-11-12, in which chimera's voice
said real Claude endings.
