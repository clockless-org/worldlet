# 03 · Desktop shell

OS integration and controlled execution. Components: electron, bridge, browser, local-tools.

See the [layer and dependency contract](../docs/UI-CORE-PLATFORM.md#repository-layers).

`electron/` is the one desktop host for Mac, Windows and Linux: windows and views,
permissions, persistence, processes, packaging and distribution ([Electron host](electron/README.md)).
`bridge/` is shared browser-side host integration; `browser/` holds the agent-browser
transport and pinned driver; `local-tools/` contains Harness-independent helper
processes. Build the common UI with `npm run build:native-ui`. No UI source or
artwork is owned by the host.
