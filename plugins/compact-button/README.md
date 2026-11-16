# Compact button

A **Compact** button in each Claude terminal's pane header that sends `/compact` to that session, so you don't
have to type it (issue #10 on Otterm). Its color shows how full the context is: green up to 20%, yellow to 50%,
orange to 75%, red above.

- **Safe typing.** Otterm types `/compact` only while Claude waits at its prompt with an empty input box, and
  presses Enter only once the box shows exactly `/compact`. If Claude is working, the button is dimmed; if the box
  holds text you haven't sent, nothing is typed and a note says why.
- **A second click.** Compacting can't be undone, so the first click turns the button into **Compact?**, and a
  second click within 3 seconds sends it. Settings → Extensions can turn that off.
- **Only Claude terminals**, on the PC and on paired devices.

Permission: **type**, to send `/compact`. It sends nothing else.
