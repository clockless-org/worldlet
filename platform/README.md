# Platform

Where the World runs, and every window that reaches it. One of the four [layers](../docs/UI-CORE-PLATFORM.md#see-do-know); it runs things and makes no product decisions.

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

| Component | Folder | What it is |
| --- | --- | --- |
| Host | [`host/`](host/) | The shared host Desktop and Server both run: the request router, the host modules (`host/modules/`), storage (`host/store/`), the vault, the `worldlet://` protocol, the browser engine's host side and the relay link |
| Desktop | [`desktop/`](desktop/README.md) | Electron around the Host for Mac, Windows and Linux: the World window, OS permissions, packaging, updates and installers (`desktop/distribution/`) |
| Server | [`server/`](server/README.md) | Node around the Host: the same World on a computer without a display |
| Web | [`web/`](web/README.md) | How any page talks to its host, the page a browser opens (`web/page/`), pairing and the room |
| Phone | [`ios/`](ios/README.md), [`android/`](android/README.md) | The iPhone and Android apps, paired the same way |

Helpers used by the Host and Desktop: `bridge/` (the page side of the host bridge), `browser/` (the agent-browser transport and pinned driver), `local-tools/` (Harness-independent helper processes), `web-engine/`, `install/` (the one-line installers) and `distribution/`.
Build the common UI with `npm run build:native-ui`. No UI source or
artwork is owned by the host.
