# Time in state

Shows how long each terminal has been waiting on you (needs approval, your turn, a trust prompt) or working, in
its sidebar row and right after the state in its pane header: `<1m`, `4m`, `1h 05m`, `2d 3h`. A wait longer than
the setting (10 minutes to begin with) turns orange, so the session that has waited longest stands out.

Settings: what to show it for (waiting on you; waiting on you or working; every running terminal), where (sidebar
rows, pane headers, or both), and when a wait counts as long. It needs no permissions: it reads each terminal's
state and when it began, and nothing else.
