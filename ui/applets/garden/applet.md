# Garden

Plant vegetables that ripen on the real clock, from half an hour to a day, and come back to harvest them.

**Not released** (owner decision 2026-10-03: "这个游戏先不上线"): the Garden is not in the catalog, so no world shows it. The board, artwork and this contract stay for when it ships; adding it back to `GAME_APPLETS` in `core/applets/definitions/games.ts` brings it in.

The Games area's slow game (owner request 2026-10-03: a farm game where a crop takes a day to ripen, so people come back twelve or twenty-four hours later). The other games are over in a few minutes; the garden gives a reason to return. The board is our own code ([ui/games/garden.ts](../../games/garden.ts)): it runs offline, needs no account and reads nothing.

- Six plots to start, up to twelve bought with coins. Pick a seed, then an empty plot to plant it.
- Radish 30 minutes, Lettuce 4 hours, Carrot 8 hours, Tomato 12 hours, Pumpkin 22 hours, Strawberry 24 hours. Longer crops cost more and sell for more, so the best value is planted at night and harvested the next day.
- Each growing plot says when it will be ripe ("tomorrow 7:40 AM"). Ripe crops wait; nothing withers and nothing is lost by staying away.
- Growth is worked out from the planting time, so nothing runs while the Applet is closed. While it is open, one timer wakes at the next minute or ripening to update the plots, and stops when the panel closes.
- The garden is kept in this computer's local storage, beside the other games' best scores.

## Runtime

- Stable identity: `app-garden`; provider: `garden` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
