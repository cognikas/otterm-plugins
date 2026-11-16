# Spend

A chip in the top bar with what the terminals on the PC have cost in the current 5-hour window, at list price:
`$4.20 5h`. A click lists every terminal that spent something, most first, with its share as a bar in its group's
color; clicking one opens it. Hovering a row shows its percentage of the total.

The setting switches it to the open sessions instead: what each terminal's current session has cost so far, which
goes back to $0 after `/clear`. The window's figure counts across `/clear` and restarts, and starts again at $0
when the next window begins. Signed in with an API key rather than a plan, Claude Code reports no 5-hour window, so
the chip shows the open sessions and says so.

On a Claude plan the figure isn't a bill: it is what the same use would cost at list price, a way to compare
sessions. Plan limits (the Usage block) count every device; this counts the terminals on the PC.
It needs no permissions: it reads each terminal's usage and the plan's window.
