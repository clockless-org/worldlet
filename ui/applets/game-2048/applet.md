# 2048

Slide the numbered tiles; equal ones merge. Reach 2048.

A game in the Games area. The board is our own code ([ui/games/game-2048.ts](../../games/game-2048.ts)): it runs offline, needs no account and reads nothing. It is built when the Applet opens and dropped when it closes, so nothing renders or ticks while it is closed. The best score stays in this window's local storage.

## Runtime

- Stable identity: `app-game-2048`; provider: `game-2048` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
