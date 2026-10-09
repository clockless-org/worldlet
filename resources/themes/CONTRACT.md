# Theme portability contract v1

This is the acceptance contract for themes authored outside Worldlet and imported at build time. This version selects one fixed theme per build; runtime downloading and theme switching are out of scope. It complements the executable `ThemePack` contract in `ui/themes/theme-pack.ts`; it does not add unsupported JSON fields. A runnable source overlay is a development prototype, not an importable Theme Pack.

## Ownership

| Worldlet owns | Theme owns |
| --- | --- |
| HUD DOM, navigation, keyboard/focus, account state, dialogs and actions | HUD material, supported skins, colors and safe-area declarations |
| Shared Applet renderers, record IDs, loading/empty/error states and persistence | Peek/Open/Focus art, content plane geometry, typography and decoration |
| Button semantics, disabled/busy state, keyboard and click handlers | Button material and visual state treatment |
| Companion behavior, task events, sound channels and permission boundaries | Rig, portraits, perches, supported event cues and licensed audio |
| Pack validation, registration, asset loading and build-time selection | Versioned JSON, local assets, provenance and declared shared fallbacks |

Themes MUST NOT ship executable JavaScript, TypeScript, arbitrary HTML/CSS, native patches, install hooks or replacement product logic in an importable artifact. Novel layouts require a reusable, trusted Worldlet renderer first. The renderer accepts theme data; downloaded theme code is never executed. Source overlays remain useful for developing that renderer, with code reviewed and merged into Worldlet before the corresponding theme can graduate.

## Required surfaces

Each Theme Pack MUST declare all existing fields below, using `shared` explicitly wherever the host's standard appearance is retained. Shared appearance is a valid choice; silently missing coverage is not.

| Surface | Existing declaration / owner | Acceptance |
| --- | --- | --- |
| World and areas | `space`, world and Style Pack manifests | One room per product group, valid connections, stable IDs, complete art references |
| Content and HUD space | `layout`, `applets.focusLayouts`, `applets.roomLayouts` | Normalized content and companion rectangles; live content, HUD and Fox do not overlap or obscure controls |
| HUD | `hud`, `surfaces.skin` | Attention, note, nameplate, back, bubble, panel, log, button, card and frame all declared; host navigation and status remain accessible |
| Fonts | `surfaces.fonts.display`, `.label`; shared Style Pack UI type scale | Bundled licensed font or explicit shared fallback; fonts load before showing the world; multilingual and missing-glyph fallbacks remain available |
| Typography roles | Shared UI tokens: caption, label, body, section, title and mono | Role-based type rather than selectors per theme; text remains live/selectable and survives long titles, empty content and CJK text |
| Buttons | `surfaces.skin.button`, supported `--theme-*` properties, shared control renderer | Primary/secondary/destructive hierarchy; default, hover, pressed, focus, disabled and busy states; visible keyboard focus; stable hit area; no text baked into images |
| Inputs and lists | Shared control renderer and supported surfaces | Search, selection, scrolling, validation and unsaved-edit protection stay functional; decorative edges do not steal pointer events |
| Applets | Style Pack `peek/open/focus`, `applets.fallback` | Icon and open scene share visual identity; content fits its declared plane; source/action ownership stays intact |
| Dialogs and errors | Shared panel/card/frame and host states | Loading, empty, failure, confirmation and overflow states tested; a theme cannot replace them with a static painting |
| Motion and sound | `motion`, shared event and audio owners | Reduced motion, visibility and cancellation respected; success never plays on failure; decoration never indicates fabricated business state |
| Companion | `companion` | Shared performance vocabulary, safe perches, still fallback and working host input |
| Startup | `surfaces.startup`, registry preparation | All selected-theme assets/fonts are available before first display; an import failure retains the previous build selection |

A new visual requirement that cannot be expressed by these fields is an **unsupported host capability**. Record it as a blocker; do not invent a theme-only field or bypass the contract with CSS selectors. For example, independent body fonts, per-Applet button materials, custom list/detail planes or new HUD arrangements require host support if the current shared renderer does not expose them.

## Compatibility and artifact

A release MUST identify its theme ID/version, `ThemePack.schemaVersion`, exact producer revision, tested public Worldlet commit and the hashes of the host contract files it was validated against. Never infer compatibility from “latest”. An update to those files requires revalidation; identical files establish contract compatibility, not complete behavioral compatibility.

The artifact contains the Theme Pack, its Style/World declarations, the referenced asset closure, license/provenance files, coverage report and validation evidence. Every owned file has a repository-relative path and SHA-256. Referenced host-shared assets are explicit dependencies tied to the tested host revision. Reject traversal, external URLs, symlinks, duplicate destinations, missing files, LFS pointers and executable payloads. A matching checksum establishes integrity, not publisher trust.

The existing theme registry uses trusted built-in registrations. Until Worldlet has a generic package registration/import path, **data validation alone does not certify one-command installation**. The consumer must support both the pack's data schema and its required renderer/registration capabilities.

## Pull and import protocol

The build-time consumer MUST perform these steps in order:

1. Resolve an explicitly selected repository and immutable commit into staging. A remote branch may be used to discover an update, but the accepted result is locked to a commit.
2. Validate the contract version, compatibility, resource closure, paths/hashes, registration and renderer requirements before changing the working installation. Never run theme-supplied scripts.
3. Build a proposed registration and asset inventory. Existing data, accounts, native browser partitions, shared UI code and unrelated themes cannot be overwritten by the package.
4. Run build and focused shared-host interaction checks, then inspect the actual host at the declared reference viewport. A standalone mock preview is insufficient.
5. Promote the complete staged package and lock record as one recoverable change. Retain the previous artifact/version for rollback. Fetch, validation, build or activation failure leaves the current theme usable.

No importer may silently apply a source overlay to make a failed package pass. The current source-overlay development commands are not this import protocol.

## Acceptance gates

| Gate | Required evidence |
| --- | --- |
| Manifest | Host `parseThemePack`, Style/World validation, resource closure and provenance |
| Presentation | HUD/type/button states, applet identity, safe areas and fallback coverage |
| Interaction | Pointer and keyboard, long content, scroll, editors, busy/error/empty states, source actions and native-browser boundaries |
| Host | Real shared HUD and companion, registered renderers, build and type checks, import rollback and state preservation |
| Visual | Actual host captures at the declared viewport; current desktop theme reference is 1500 × 844; compare against authored references |
| Import | Deterministic locked staging and registration, missing/incompatible asset rejection, no code payload, failure rollback |

A release passes all gates. `preview` means a development implementation can run; `blocked` means the import contract has unmet requirements; `ready` requires consumer import evidence. A coverage declaration or successful screenshot cannot promote a theme to ready by itself.

## Current migration

Village's external four-Applet prototype and Hogwarts's source overlays need trusted renderer integration before they qualify as importable releases. Move reusable rendering/control behavior into Worldlet, expose supported data fields for scene geometry and materials, then express each theme through those fields. Consolidate fonts/buttons/HUD through the shared owners and retire the corresponding overlay overrides. Keep the preview using those same owners so that approval in the theme repository represents what the consumer will render.

Runtime downloading and theme switching are explicitly excluded from v1. The selected theme is resolved during development and bundled with the application. No new Settings switcher, download UI or live activation flow is required by this contract.
