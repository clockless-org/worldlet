# Random game

A different small game from worldlet.ai/games each time it opens.

The fifth place in the Games area (owner requests 2026-10-03: "第五个游戏改成随机的", then "我们做一堆 html5 游戏，serve 好，随机入口会自动打开一个"). It is a website Applet: it opens `https://worldlet.ai/games/random/`, which picks one of the games served from website/games, never the one just left and nothing played lately while fresher games remain, and **Another game** on every game page picks again. The games are our own code; they need no account and read nothing. Best scores stay in the website panel's local storage. Unlike the four boards beside it, it needs the network.

## Runtime

- Stable identity: `app-random-game`; provider: `random-game` (only worldlet.ai is opened).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **website**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
