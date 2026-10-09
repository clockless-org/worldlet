# Build theme contract v1

A theme is a **trusted presentation source directory copied at build time**. Worldlet imports one directory and compiles it with the app. Themes may change independently as long as they implement this versioned interface. There is no runtime theme download or switching protocol.

The executable API is [build-theme-contract.ts](../../ui/themes/build-theme-contract.ts), exported as the type-only `@worldlet/theme` module. The existing data-only `ThemePack` still describes the inherited world, art and shared surfaces; it does not prohibit trusted presentation source being compiled into the application.

## Directory

```text
package/
  theme.json       # contractVersion, identity, presentation coverage
  entry.ts         # default export implements BuildTheme
  theme.css        # theme-owned presentation and shared CSS hooks
  assets/          # backgrounds, icons, fonts and license files
  …                # local TypeScript helpers and provenance
```

The source may import local helpers and **types** from `@worldlet/theme`. It cannot import private Worldlet modules or Node dependencies. The importer compiles and type-checks without evaluating the entry, rejects symlinks and unresolved LFS files, then replaces only `ui/selected-theme`. It generates the public index and a source hash inventory. An invalid package leaves the old selection unchanged. This is a development-source boundary, not a sandbox for untrusted scripts: review the source before importing it.

## Manifest

```json
{
  "contractVersion": 1,
  "id": "village",
  "version": "1.0.0",
  "title": "Village",
  "entry": "entry.ts",
  "stylesheet": "theme.css",
  "assets": "assets",
  "inherits": "village",
  "hud": "shared",
  "fonts": "bundled",
  "buttons": "styled",
  "applets": ["gmail", "google-calendar", "apple-notes", "apple-reminders"]
}
```

`hud` and `buttons` are `shared` or `styled`; `fonts` is `shared` or `bundled`. Each theme declares its choices, not a claim that every surface has original art. V1 inherits the registered Village world for surfaces it does not implement. It supports replacing Applet scenes and styling the shared shell; a completely new world renderer is not part of this interface yet. Other IDs can use the same interface and inheritance without host edits.

## Runtime API

`entry.ts` exports `{contractVersion: 1, id, renderApplet(context)}`. The ID must match the manifest. `renderApplet` returns `false` to use the standard host renderer, or `{dispose()}` after rendering into `context.host`.

| Context | Contract |
| --- | --- |
| `host` | Owned Applet surface. Host clears it before each render. Do not replace the surrounding shell. |
| `applet.id`, `.title` | Stable product identity; the theme never renames/moves data. |
| `items` | Read-only in practice: IDs, display fields and source records. Copy before editing; never mutate host state. |
| `data` | Current time, demo/connection/loading/error state and optional calendar save/remove capability. No account credentials. |
| `openItem(id)` | Host source-reader action; unknown IDs are ignored. |
| `invalidate()` | Request a re-render with the current host inputs. |
| `renderDefault(target)` | Host-owned full Calendar/reader surface for the current applet. |
| `dispose()` | Remove any observers/listeners/timers created by this render. Called on replacement, hide and stage destruction. |

Business logic and persistence remain in Worldlet. A theme may own transient search, selection, editor and animation state. Writes are available only through supplied capabilities; an unavailable write operation must not be invented or simulated as a successful account update. Native websites remain on the existing native-browser path.

## HUD, fonts and buttons

| Surface | Stable styling contract |
| --- | --- |
| World scope | `.ui-theme-world` identifies the host World. |
| Applet | `.ui-theme-applet[data-theme-rendered=true]` identifies a theme-rendered stage. Theme classes inside it are private to that theme. |
| Companion / command HUD | `.ui-theme-companion` exposes the host-owned command bar for placement/material styling. Keep its controls usable. |
| Shared controls | Existing public `.ui-button` and `.ui-title` component classes and `--ui-*` UI token roles; do not reach private host IDs. |
| Fonts | Bundled licensed fonts via `@font-face`, with URLs under `theme-assets/`; retain readable system/CJK fallbacks. |
| Buttons | Theme CSS provides default, hover, pressed, focus-visible, disabled and busy appearances without changing actions or hit areas. |

Assets are copied from `assets/<file>` to `theme-assets/<file>`. Use those URLs in the renderer/CSS. The generic build appends the selected stylesheet after shared styles. Selection replaces the directory and removes stale output assets; it never overlays arbitrary files onto the host repository.

The preview MUST run the same selected source against the host stage. Validate HUD/content/Fox overlap, typography, source actions, keyboard focus, long content, empty/error/loading states, local edits and reduced motion at the declared reference size (currently 1500 × 844). A demo screenshot is evidence of presentation, not an authenticated account test.

## Developer workflow

After pulling the chosen revision of the themes repository, run in Worldlet:

```sh
npm run theme:source-check -- /path/to/worldlet-themes/themes/village/package
npm run theme:import -- /path/to/worldlet-themes/themes/village/package
npm run build:native-ui
npm run theme:preview
```

Changing the package path changes the theme for the next build. No registry, HUD, stage or build-script edits are needed per theme. The imported folder is ordinary reviewable source and may be committed with the build selection. The public interface, not the current source commit or a theme's internal file names, defines compatibility. Breaking changes require a new contract major version.

Host checks: `npm run test:theme-source` tests duplicate/import/replacement failures and boundaries. After building, `npm run test:theme-ui` exercises the imported Village through the real host stage in a hidden Electron window. The preview uses fictional data and no account writes.
