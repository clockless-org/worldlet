# Snake

Steer the snake through the garden and eat the apples without biting your tail.

A game in the Games area. The board is our own code ([ui/games/snake.ts](../../games/snake.ts)): it runs offline, needs no account and reads nothing. It is built when the Applet opens and dropped when it closes, so nothing renders or ticks while it is closed. The best score stays in this window's local storage.

## Runtime

- Stable identity: `app-snake`; provider: `snake` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
