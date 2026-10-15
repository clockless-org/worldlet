# Node host (layer 03 · Platform)

Worldlet with no screen: a plain Node process for Linux and any computer without a display. It runs the same host
modules as the [Electron host](../electron/README.md) that work without a window, so Attention reading, routines, the
standing `worldlet` MCP server for Hermes Agent and the [browser link](../../core/phone/README.md#web) run as they do
in the desktop app, and a phone or any web browser reaches this computer through the pairing room.

This is the first step of the headless service. There is no command line, installer or package yet.

## What it runs

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Entry: profile, store, router, a page bridge with no page, the vault, the modules below; starts their work at once, writes the browser link and stops on SIGTERM |
| `src/electron-shim.ts` | Stands in for `electron` (aliased at build time): process facts answer, window constructors throw, and dialogs, the clipboard, shell opens and notifications fail with "Needs the desktop app" |
| `src/vault-storage.ts` | The vault's encryption without a keychain: AES-256-GCM with a random key in an owner-only `vault.key` beside `vault.json` |

Installed modules, in the Electron host's order: World, Fox, Attention, Agent runtime, Sources, Phone, Ongoing,
Artifacts and Calendar. The shell, browser, media, World sound, voice, Applet tools, games, widgets, artifact pages,
site Applets and Applet art need a screen and are left out. A host action from a left-out module answers that this
build does not support it.

Differences from the desktop app:

- **Room only.** Browsers' direct lines (WebRTC) run in a hidden Electron window in the desktop app; this host provides
  no `rtcPage` service, so every frame of a browser link goes through the pairing room.
- **No World page.** World tools that run only on the page (navigation, websites, widgets, Applets) answer that the
  World must be open.
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

## Build, run and check

| Command | Purpose |
| --- | --- |
| `npm run build:native-ui` | The interface build the host reads (`dist/WorldletWeb`) |
| `npm run build:node-host` | Bundle the host to `dist/node/worldlet.cjs` (`--out <dir>` for another folder) |
| `node dist/node/worldlet.cjs` | Run it; SIGTERM or Ctrl-C stops it |
| `node dist/node/worldlet.cjs --host-contract-check` | Print the actions, services and capabilities it implements, on a temporary library |
| `npm run test:node-host` | Shim and vault storage checks, then build, contract check, boot, restart and stop |

Node 22.19 or later.
