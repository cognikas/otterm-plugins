# Auto-compact

When a Claude terminal waits at its prompt between turns and its context is past a mark (80% to begin with, or the
context warning set in Settings → Display), it gets `/compact` by itself after a countdown: 10 seconds to begin
with, shown in its pane header and its sidebar row, each with a **Cancel**. A note at the bottom of the page says
which terminal is about to be compacted.

- If Claude starts working, the turn changes or the context drops before the countdown ends, nothing is sent.
- Cancel means not this time: it asks again after Claude's next turn.
- After a `/compact` it waits until the context reads under the mark before it counts down again for that terminal.
- Otterm types the command only into an empty input box, and presses Enter only once the box shows exactly
  `/compact`. When you have text there you haven't sent, it says so and types nothing.

It runs in Otterm's window on the PC only, so a phone or laptop with the remote page open doesn't count down a
second time. It needs the **type** permission, used only for `/compact`.
