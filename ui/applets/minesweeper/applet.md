# Minesweeper

Clear the field without digging up a mine. The numbers tell you how many are near.

A game in the Games area. The board is our own code ([ui/applets/minesweeper.ts](../minesweeper.ts)): it runs offline, needs no account and reads nothing. It is built when the Applet opens and dropped when it closes, so nothing renders or ticks while it is closed. The best time for each board size stays in this window's local storage.

Start on a 6 × 5 field with 10 mines, or choose the classic 10 × 10 field with 14 mines. Reveal and Flag buttons change the click action; right-click, F or a long press toggles a flag. Arrow keys move focus between tiles. The first reveal and its neighbours are safe. The clock starts with the first reveal, freezes at a win or loss and stops repainting when the Applet closes. Rules live in [Core](../../../context/store/GAMES.md#built-in-minesweeper).

A measured scene can place the heading, live timer/mine toolbar and mode controls around a projected board. Stone or other material sprites never decide the rules. The shared game symbols retain the [Bootstrap Icons license](../ICONS-LICENSE.txt).

## Runtime

- Stable identity: `app-minesweeper`; provider: `minesweeper` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
