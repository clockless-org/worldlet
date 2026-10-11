# Game Factory

The Games area's **Game Factory** makes small games the person asks for (owner request 2026-10-03: "游戏工厂…你可以自己跟小狐狸说我想做一个什么什么样的游戏然后它就应该能…帮你直接做出来"). It is not an Applet: it is the Games area's landmark, a game workshop behind the area (owner decision 2026-10-03: "工厂不是一个applet，他是特殊的Games area后面的景观"). Selecting the landmark opens the Games area panel, where games are discovered (the area's lists) and made.

**Status: coming soon** (owner decision 2026-10-03: "先coming soon"). The panel shows **Make a game** as coming soon, and `GAME_MAKING_OPEN` keeps the game tools out of Fox's catalog. The rules, the trial and the sandboxed player below are built and checked, ready for when making opens; the flow then needs an Applet task owner for the Factory (`GAME_FACTORY_APPLET`).

## Flow

1. The person types the game they want in the Games area panel, or says it to Fox anywhere ("I want a game like Flappy Bird, but with a fox").
2. Fox calls `make_game` (World target `games/make`) with the idea in their words. Only the person's own words this turn can start it. The host checks the model rule below and hands the work to the Factory as an [Applet task](../../docs/FOX-AGENT.md#applet-tasks): it runs in the background beside the conversation, the screen over the Factory says what it is doing, and the conversation never waits.
3. In that task Fox's model writes **one self-contained HTML page** and sends it with `save_game` (`games/save`). Its description is the contract: inline script and style only, nothing from the network, fills a 900 × 600 window down to 360 px wide, starts drawing at once, keyboard and mouse, a restart, under 300 KB. `window.worldlet.best(score)` reports a score worth keeping.
4. The host checks the page (`checkMadeGameSource`), then plays it for a few seconds out of sight (`platform/electron/src/modules/games/trial.ts`): it must load, draw something other than a blank screen and survive a few keys and a click without a script error. Problems go back to the model, which fixes them and saves again; the task's own turn limit bounds the rounds.
5. A game that passes is saved, leads the Games area panel (newest first) and Fox says it is ready. It opens in a play view with **Restart** and **Ask Fox to change it**, which calls `make_game` with `replaces` (the model reads the current page with `read_made_game`).

`list_made_games` (`games/list`) lets Fox name and change earlier games.

## Sandbox

A made game is untrusted code. It never runs in the World page (which allows no frames) and has no host bridge:

- It plays in its own `WebContentsView` laid over the rect the page reserves (`GamePlayer`), sandboxed, without Node or a preload, in the in-memory `worldlet-made-games` session: no permissions, downloads refused, and every request that is not the page itself (`data:`) or something it made (`blob:`) is cancelled. WebRTC, whose UDP never passes that request filter, is limited to proxied UDP, which leaves it no route (`lockGameContents`, also used by the trial and the Widgets player).
- The page is a `data:` document, so its origin is opaque: no cookies or storage shared with anything. A small prelude (`madeGameDocument`) adds the policy `MADE_GAME_POLICY` (inline code only, no connections, frames, workers or forms), replaces local storage with an in-memory one and defines `window.worldlet.best`.
- Navigation and new windows are refused. The only channel back is the game's own console lines that start with `MADE_GAME_REPORT`, read for a best score (and for script errors during the trial).

## Storage

Local first: games stay in this World and never go to a server.

Made games live in the World's database, `world.sqlite` (owner decision 2026-10-05: everything in the World is recorded there), so a World backup carries them:

| Table | Holds |
| --- | --- |
| `made_games` | One row per game: the page the model wrote (`html`) and its record (`record`: title, one-line blurb, accent color, the person's words that asked for it and each change, created/updated time, version and best score) |
| `made_game_versions` | The last three replaced pages of each game |

Before 2026-10-05 each game was a folder, `games/<id>/` (`game.html`, `game.json`, `versions/<n>.html`); it moves into the database once (`platform/electron/src/store/moved-in.ts`) and stays as `games.before-database` for a month. The practice world has no Game Factory. Deleting a game asks first and removes its rows. At most 60 games per World.

## Model

Making a game takes many model tokens, so it needs an Agent that answers on the person's own sign-in: a ChatGPT plan (Codex sign-in) or their own API key, Anthropic or OpenAI, chosen in Settings › Your Agent (`gameFactoryModel`). With neither (Worldlet provides no model of its own, owner decision 2026-10-05), `make_game` returns the reason and Fox offers to open Settings › Your Agent. A claude.ai subscription sign-in cannot be used by other apps, so Claude means an Anthropic API key. Playing a made game needs nothing. The Agent must support Applet tasks (the built-in Hermes Harness does).

## Checks

`node scripts/game-factory-check.ts` checks the rules here: the static checks, the prelude, reports, records, the model rule, and that making stays closed (no game tools offered, the Factory is not an Applet).

## Battle review

Separate from the Factory: Fox reviews the games the person plays on websites (#1598; owner promise to a VGC player in the 2026-10-03 recording, who wanted feedback on team building, the teams they lose to and each turn's choices after about ten games). The [website recorder](../../contracts/README.md#website-recording-for-fox) keeps a battle's WebSocket messages; the [Pokémon Showdown](../../ui/applets/pokemon-showdown/applet.md) Applet opens the site.

- **Asked.** "帮我复盘最近几局": the conversation guidance (`core/companion/conversation-guidance.ts`) has Fox find the visit, read each game from team preview to result and answer as a coach on those three things. With routines available it may offer, once, to look up newer strategies for the format each morning.
- **Unasked.** `battle-review.ts` follows the messages a battle site sends (Showdown's protocol is the one known: `|init|battle`, `|player|`, `|request|`, `|win|`, `|tie`). It counts only the person's own battles (their name from the lobby connection, or the side the site asks them to choose for), not ones they watch. Once a session is over (no battle in progress and three minutes since the last result) or ten finished games wait, the host (`platform/electron/src/modules/browser/battle-review.ts`) hands the newest ten to Fox as an [Applet task](../../docs/FOX-AGENT.md#applet-tasks) of Pokémon Showdown. The task names the games and asks for at most twelve lines that lead with the most important change; the result reaches the person like any task result, and the conversation keeps it for follow-up questions. At most one every 20 minutes (unless ten games wait) and six a day; games older than six hours, and games from before a restart, are left for the person to ask about. Nothing starts while the person is idle (#1664), in the practice world or before setup. No person's words are behind such a task, so it starts untrusted: it reads and answers, but cannot make guarded writes.

Checks: `node scripts/game-review-check.ts` (in `test:core`, so PR CI) records battles through the recorder, reads them back the way Fox does and covers when a review starts. Its battles include six VGC-style ones with one team (`scripts/fixtures/showdown-session.json`, made by `scripts/fixtures/make-showdown-session.mjs` with the official simulator). A real-model review used to gate the Mac RC; it was removed (owner request 2026-10-05: RCs within 20 minutes), since it graded a model's answers and was not release-breaking.
