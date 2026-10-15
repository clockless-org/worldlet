# Node host (layer 03 · Platform)

Worldlet with no screen: a plain Node process for Linux and any computer without a display. It runs the same host
modules as the [Electron host](../electron/README.md) that work without a window, so Attention reading, routines, the
standing `worldlet` MCP server for Hermes Agent and the [browser link](../../core/phone/README.md#web) run as they do
in the desktop app, and a phone or any web browser reaches this computer through the pairing room. The World itself,
the same 3D World page the app shows, opens in a web browser on this computer.

Each Agent that reaches the standing server gets its own token, endpoint file, Grants and audit here as in the desktop
app ([Agent identity, Grants and audit](../../core/agent/GRANTS.md#the-standing-mcp-server)); the token hashes go into
this host's own vault.

This is the headless service: the host, the `worldlet` command line that talks to it, the fixed MCP home Agents
register, and its [Linux package](#package), which the [one-line installer](../install/README.md#linux) installs.

## What it runs

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | The program: `worldlet.cjs <command>` is the [command line](#the-worldlet-command); anything else runs `main.ts` |
| `src/control.ts` | The control socket (owner-only, in the library) and the command line's side of it |
| `src/qr.ts` | The browser link's QR code drawn in a terminal (`worldlet link --qr`), white on black so it scans on any terminal |
| `src/mcp-home.ts` | The [fixed MCP home](#one-fixed-mcp-home) and `register`: each Agent's own command, and the Worldlet skill in its skills folder |
| `src/main.ts` | Entry: profile, store, router, the World page in a browser as its page bridge, the vault, the modules below; starts their work at once, serves the World, writes the browser link and the World link and stops on SIGTERM, or on a `worldlet:stop` message from a parent's IPC channel (Windows) |
| `src/electron-shim.ts` | Stands in for `electron` (aliased at build time): process facts answer, window constructors throw, and dialogs, the clipboard, shell opens and notifications fail with "Needs the desktop app" |
| `src/vault-storage.ts` | The vault's encryption without a keychain: AES-256-GCM with a random key in an owner-only `vault.key` beside `vault.json` |

Installed modules, in the Electron host's order: World, Fox, Attention, Agent runtime, Sources, Phone, Ongoing,
Artifacts and Calendar. The shell, browser, media, World sound, voice, Applet tools, games, widgets, artifact pages,
site Applets and Applet art need a screen and are left out. A host action from a left-out module answers that this
build does not support it.

Differences from the desktop app:

- **Room only.** Browsers' direct lines (WebRTC) run in a hidden Electron window in the desktop app; this host provides
  no `rtcPage` service, so every frame of a browser link goes through the pairing room.
- **The World page is in a browser.** World tools that run only on the page (navigation, websites, widgets, Applets)
  work while a browser has the World open, and otherwise answer that the World must be open. What a browser window
  cannot do is not offered there: websites and the Browser open in a new tab, and YouTube, the World's sound, voice and
  the desktop Companion are hidden ([what a browser window cannot do](../../docs/UI-CORE-PLATFORM.md#the-world-in-a-web-browser)).
- **Its own vault.** The secrets are as safe as `vault.key` (the computer account and disk encryption), not tied to a
  keychain. A vault the Electron host wrote with `safeStorage` is not readable here, nor this one there.

## Library

The release library, the same place the Electron host uses on Linux: `$XDG_DATA_HOME/Worldlet`, by default
`~/.local/share/Worldlet`. `WORLDLET_PROFILE_ROOT` names another library. The host reads the interface build from
`WorldletWeb` beside its program file (in a checkout, `dist/WorldletWeb` beside `dist/node`) and refuses to start
without it.

On start it makes the browser link once (a restart keeps it) and writes it to `room-link.txt` in the library
(owner-only). The log says only that the link is ready and where that file is: the link is the pairing secret, and
anyone who has it reaches this computer's Fox and Attention Center, so it never goes to stdout or a service's journal.
In a turn with Fox, the Agent can also get it with `world/link` (see [Web](../../core/phone/README.md#web)).

## The World in a browser

The host serves the full World page (the interface build) on `http://127.0.0.1:<port>`, on the first free port from
47630 (the one the browser link on this computer uses, kept across restarts), and writes its link,
`http://127.0.0.1:<port>/world/#t=<token>`, to `world-link.txt` in the library (owner-only). Open that link in a
browser on this computer. The page uses the same router as the app's World page, over a WebSocket at `/world/socket`
([host/web-page.ts](../electron/src/host/web-page.ts), [web-host.ts](../bridge/web-host.ts)): the host calls the page
and sends it events as it does in the app, a new snapshot goes to it whenever the World changes, and the page connecting
and going away are the host's page load and reload. One page at a time: a newer tab takes over and the older one says
the World is open elsewhere. When the host stops, the page says so and reloads once it is back.

The token is 32 random bytes, kept in the vault (`world-web-token`), so a restart keeps the link. The log says only
that the World is ready and where its link is. The server answers only this computer by name, the socket needs the
page's own origin and the token, and a browser's page cannot ask for what `WEB_DENIED` lists
([trust](../../docs/UI-CORE-PLATFORM.md#the-world-in-a-web-browser)). To reach it from another computer, forward the
same port number over SSH (for 47630, `ssh -L 47630:127.0.0.1:47630 <computer>`) and open the link there; opening the
World from another device without that is a later step.

## The `worldlet` command

`node worldlet.cjs <command>` asks the running host over its control socket, `control.sock` in the library (owner-only,
0600; a named pipe on Windows), and prints the answer. The answer goes only to the asker's stdout; the host logs
nothing of it. With no host running it says so and exits with code 3.

| Command | What it does |
| --- | --- |
| `status` | The version and library, Fox's Agent, whether the person finished setup, the browser link's state (never the link) and the Agents registered from the MCP home |
| `link [--qr]` | Prints the browser link (`world/link`'s, the one in `room-link.txt`), with `--qr` also its QR code; anyone who has it reaches this World, so it is for the person alone |
| `setup --agent <id>` | Chooses the Agent Fox talks through with setup's own `agentHarness` `select` (it proves the Agent answers first; Codex alone is no Agent for Fox), then registers Claude Code or Codex as below |
| `register --agent <id>` | Registers the `worldlet` MCP server and skill in `claude-code` or `codex`. Hermes Agent gets its entry in its own profile once it is Fox's Agent ([World tools on Hermes](../../core/agent/PORTABILITY.md#world-tools-on-hermes)) |

Neither command gives consent or finishes onboarding: World tools on the standing server keep answering that the person
has not finished setting up until they do so in the World, as in the desktop app.

## One fixed MCP home

`~/.worldlet/mcp` (`WORLDLET_HOME` names another place than `~/.worldlet`) holds the standing server's stdio shim
(`worldlet-mcp-standing.cjs`), its tool list and one owner-only endpoint file per Agent
(`worldlet-mcp-endpoint.<agentId>.json`, [per-Agent tokens](../../core/agent/GRANTS.md#the-standing-mcp-server)). The
names never change, so an Agent registers once: each run the host writes this run's endpoint and the Agent's new token
into the same file, and removes it when it stops, so a call then answers that Worldlet is not open. `registered.json`
lists the Agents registered here. Each registers with its own command (`core/agent/harness-connections.ts`):

- Claude Code: `claude mcp add --scope user worldlet --env WORLDLET_MCP_ENDPOINT_FILE=… --env WORLDLET_MCP_TOOLS_FILE=… -- <node> ~/.worldlet/mcp/worldlet-mcp-standing.cjs`, after `claude mcp remove --scope user worldlet`; the skill goes to `~/.claude/skills/worldlet/SKILL.md` (under `CLAUDE_CONFIG_DIR` when set).
- Codex: `codex mcp add worldlet --env … -- <node> …`, after `codex mcp remove worldlet`; the skill goes to `~/.codex/skills/worldlet/SKILL.md` (under `CODEX_HOME` when set).

The skill is [harness/skills/worldlet/SKILL.md](../../harness/skills/worldlet/SKILL.md), built into the program.

## Build, run and check

| Command | Purpose |
| --- | --- |
| `npm run build:native-ui` | The interface build the host reads (`dist/WorldletWeb`) |
| `npm run build:node-host` | Bundle the host to `dist/node/worldlet.cjs` (`--out <dir>` for another folder) |
| `node dist/node/worldlet.cjs` | Run it; SIGTERM or Ctrl-C stops it. On Windows, where SIGTERM ends a process at once, a parent that started it with an IPC channel sends `{type:'worldlet:stop'}` for a clean stop |
| `node dist/node/worldlet.cjs --host-contract-check` | Print the actions, services and capabilities it implements, on a temporary library |
| `node dist/node/worldlet.cjs status` | The [command line](#the-worldlet-command): `status`, `link [--qr]`, `setup --agent <id>`, `register --agent <id>` |
| `npm run package:linux` | The [Linux package](#package) in `dist/ci/linux` (`-- --arch x64` for one architecture, `-- --reuse-web` to keep the interface build already there) |
| `npm run test:node-host` | Shim and vault storage checks, then build, contract check, boot, restart and stop; the command line against fake `claude` and `codex` commands (socket and endpoint files owner-only, the link never in the log); `link --qr` read back as the link's QR code; then the World in headless Chromium (SwiftShader WebGL) on a library with one item, and the server's refusals (`-- --screenshot <file>` keeps a picture) |

Node 22.19 or later.

## Package

`scripts/package-node-host.ts` (`npm run package:linux`) builds `worldlet-server-<label>-linux-x64.tar.gz` and
`-linux-arm64.tar.gz`. Each holds `worldlet.cjs`, the interface build it serves (`WorldletWeb`, with
`applet-runtime.json`, `attention-applets.json` and `applets/`), Node 22.22.1 for that architecture in `node/` (from
nodejs.org, checked against the hashes pinned in the script), the `bin/worldlet` command (that Node running
`worldlet.cjs`) and `SHA256SUMS` of every file. Beside them it writes each tarball's `.sha256`, the record
`worldlet-server-<label>-linux.json` (Build, version and each tarball's size and SHA-256) and `release.json`. Release
machine 02 builds them with the Mac package of the same commit, and `node scripts/ci-release.mjs publish --platform
linux` puts them on the Build's release and writes the channel's Linux feed (`linux-dev.json`, `linux-alpha.json`,
`linux.json` on Beta); a promotion moves them with Mac ([releasing](../../docs/RELEASING.md)).
