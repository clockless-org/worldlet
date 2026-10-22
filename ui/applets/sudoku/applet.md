# Sudoku

Fill the grid so every row, column and box holds 1 to 9. A new puzzle every game.

A game in the Games area. The board is our own code ([ui/applets/sudoku.ts](../sudoku.ts)): it runs offline, needs no account and reads nothing. It is built when the Applet opens and dropped when it closes, so nothing renders or ticks while it is closed. The best score stays in this window's local storage.

## Runtime

- Stable identity: `app-sudoku`; provider: `sudoku` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

## Controls and scene placement

Select a square, then type 1–9 or use the keypad. N toggles pencil marks, Delete erases, and the Undo button or Command/Control-Z restores the previous edit. Clues stay fixed; duplicate entries show a conflict. The timer starts on the first edit and stops on completion. New game creates another uniquely solvable puzzle. Core owns these decisions in [sudoku.ts](../../../context/store/sudoku.ts).

A measured scene can place the same live board on its primary plane and move the title, subtitle, timer, reset, keypad, tools, legend and hint into named regions. Its picture contains no playable state. With no regions, the same controls remain in the ordinary panel. `scripts/sudoku-scene-check.ts` verifies projected pointer and keyboard input, notes/erase/undo, completion, fallback and disposal.
