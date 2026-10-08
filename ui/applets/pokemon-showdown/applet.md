# Pokémon Showdown

Battle other trainers with Pokémon teams, random or your own.

A website Applet in the Games area (owner request 2026-10-04). It opens `https://play.pokemonshowdown.com/` (Smogon), free to play as a guest, and reads nothing itself. Like every website in the built-in browser, a game played here is recorded in the World ([website recording](../../../contracts/README.md#website-recording-for-fox)): the battle's turn-by-turn protocol arrives as WebSocket messages, so Fox can find the last games with `browser/records` and read them back with `browser/record` to look over how they went. Asked to review them (“帮我复盘最近几局”), Fox reads each game from team preview to result and answers as a coach: the result, both teams and the four brought, the turns that decided it and what would have been better, and what repeats across games ([website recording](../../../contracts/README.md#website-recording-for-fox), `scripts/game-review-check.ts`). The review covers what the player asked for: team building, the opponents they lose to and each turn's choices. When a session of battles ends, Fox reviews it without being asked, as this Applet's task, and says the result ([battle review](../../../core/games/README.md#battle-review)). The device uses the owner-approved original blue-and-orange creature duel artwork; its generation and processing are recorded in [provenance](../../../resources/styles/builtin/assets/applets/pokemon-showdown/provenance.json).

## Runtime

- Stable identity: `app-pokemon-showdown`; provider: `pokemon-showdown`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **website**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
