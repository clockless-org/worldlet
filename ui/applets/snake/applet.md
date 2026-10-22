# Snake

Steer the snake through the garden and eat the apples without biting your tail.

A game in the Games area. The board is our own code ([ui/applets/snake.ts](../snake.ts)): it runs offline, needs no account and reads nothing. It is built when the Applet opens and dropped when it closes, so nothing renders or ticks while it is closed. The best score stays in this window's local storage, separately for each field.

The shared Applet starts on a wide 16 × 12 field with seven pieces and a visible apple. Use arrow keys, WASD, a swipe or the direction buttons. Space and the visible command button pause/resume; leaving focus or hiding the document pauses automatically. Returning to the page does not silently resume. Filling the field wins with no apple left on the body. Direct board callers retain the classic 18 × 18 start.

A measured scene can place the title, Score, Best, commands and directions on separate surfaces. Static tile and food sprites supply material; the shared [Core rules](../../../context/store/GAMES.md#built-in-snake) own movement and state. The live grid and pieces follow the same projection as the pointer surface. Without sprites the existing canvas appearance consumes that same state.

Symbols retain the Bootstrap Icons [MIT license](../ICONS-LICENSE.txt) and unmodified Font Awesome Free v6.7.2 arrows retain their [CC BY 4.0 attribution](../ARROWS-LICENSE.txt).

## Runtime

- Stable identity: `app-snake`; provider: `snake` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
