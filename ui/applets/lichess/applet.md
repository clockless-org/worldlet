# Lichess

Free chess: play people or the computer, solve puzzles. No ads.

A popular web game in the Games area shelf (owner request 2026-10-03: import the most popular games from Sekai and similar game communities when they already have a playable link). Why it is here: Free, ad-free chess site with millions of games a day. It is a website Applet: it opens `https://lichess.org/` (lichess.org), free to play without an account, and reads nothing. The device art is the game's own art on the shared arcade frame ([provenance](../../../resources/styles/builtin/assets/applets/web-games-provenance.json)).

## Runtime

- Stable identity: `app-lichess`; provider: `lichess`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **website**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
