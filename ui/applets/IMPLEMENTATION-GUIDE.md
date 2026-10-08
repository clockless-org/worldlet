# Applet implementation guide

This is ordinary project documentation, not an agent skill. Start with [Design guide](DESIGN-GUIDE.md). That handbook governs appearance and interaction; this file covers implementation. Existing adapters and runtime behavior must be inspected before claiming support.

## Workflow

1. Define purpose, Region slot, recognizable brand/function device, data source and supported operations. Distinguish native Peek → Open → Focus from website Peek → Focus.
2. Review the states together, using the approved world palette, projection and ground scale. Keep content and dates live, not baked into images.
3. Prepare device parts, anchors, shadows, hit areas and animation states. Register their provenance and test them in the real scene at each zoom.
4. Register the definition and route. Connect authorized real data through the existing API, MCP, CLI, OS adapter or local-file reader. A declared provider or working website is not a completed connector.
5. Connect Fox actions to the same validated operations and selected item as direct UI interactions. Keep permissions, credentials and user data outside definitions and assets.
6. Verify navigation, layout, empty/loading/error/cancelled states, long content, keyboard access, reduced motion and media cleanup. Separate fixture results from actual account acceptance.
7. Document limitations; commit on a feature branch, push an issue-linked PR, run proportional checks, squash-merge through GitHub and fast-forward primary main from origin. Follow the current development workflow.

## Backend-independent Applet contract

An Applet is the World-facing UX, not a backend protocol or plugin format.
Its device, Peek → Open → Focus navigation, content and Fox actions form one
experience. An implementation may combine API, CLI, MCP, plugin-provided tools,
OS adapters, local files and Web. Switching a backend must not create a new
Applet identity or move its installed place.

| Concern | Owner and contract |
| --- | --- |
| World presentation | Shared UI owns sprites, animation, views, selection, lamp rendering and Fox controls. |
| Capabilities and state | Core/Contracts define available operations, validated inputs, structured results, connection and operation state, source identity and errors. UI checks capabilities rather than transport names. |
| Execution | Existing trusted Platform/Harness adapters perform authorized IO; a plugin is a capability package, not another runtime layer. |
| Background work | Existing Applet runtime owns lifecycle, schedules and checkpoints; Attention remains an optional consumer. |
| Account and data | Grants, account identity, originals and durable user state stay outside artwork and installable packages. Installing a package does not authorize its services. |

For each operation, document its stable name, input/result shape, source/account
identity, required grant, read/write effect, cancellation/error behavior and
implemented adapter. Fox and direct controls call the same validated World
operation. Keep unavailable, disconnected, empty and failed states distinct;
never infer a successful connection from opening a website. Map real operation
state to the existing shared lamp policy, independently of the current view.

Choose views from implemented interaction capabilities, not from how data is
fetched. An API or MCP can power a native Open/Focus experience; Web can remain
an alternative Focus surface in that same Applet. An MCP is not inherently a
UI, although an MCP Apps server may provide optional UI resources. A CLI can
supply structured data without showing a terminal to the user.

### Curated dependencies at packaging time

Worldlet authors choose and package each Applet's backend dependencies; end users
are not expected to install third-party plugins. Reuse a publisher's public
plugin, MCP, CLI or API when it provides the needed capability, then map its
results into the existing World UX. Account authorization remains a user step.
A universal end-user plugin installer is not part of this plan.

Record the dependency source, license/distribution terms, pinned version or remote
endpoint, supported operations and auth requirements. Review package scripts and
host-specific hooks rather than executing them implicitly. A documentation-only
plugin does not supply account access; a developer/merchant API does not imply a
personal feed or wallet API. Keep existing working adapters unless replacement
has a concrete benefit. Test one vertical slice: authorization, structured read,
Open/Focus content, an authorized action, source readback and runtime status.

The dated catalog audit and prioritized native backlog
records all 90 registered Applets at its inspected revision, source evidence,
external official references and missing account/device verification. The catalog
remains authoritative; that Issue is a snapshot, not a second live roster.

### Plugin compatibility direction

Agent Plugins packaging and MCP Apps UI are optional interoperability targets,
not prerequisites for authoring an Applet. Reuse portable metadata, skills and
MCP declarations when supported; retain Worldlet's own visual and runtime
contracts. Skills describe optional agent workflows; this design/implementation
handbook remains ordinary documentation, not a Create Applet skill.

A future compatibility adapter must validate manifests, declare supported
components and route tools through existing permissions. Third-party UI belongs
in an isolated external surface with a scoped bridge, never in the trusted World
DOM or with unrestricted native bridge access. Host-specific extensions, hooks,
service authentication and script dependencies require explicit support. Do not
assume OpenAI-directory availability, portable credentials or automatic Hermes
package loading.

References: [Agent Plugins packaging](https://developers.openai.com/plugins/build/plugins)
and [MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui).

### Current evidence and limits

- `contracts/world.ts` already separates `scene`, `fullView` and `connection` in
  `AppletDefinition`; `connection` is currently a loose single declaration,
  **not** a typed multi-backend operation registry.
- `core/applets/definitions/gmail.ts` combines a scene view with an original Web
  route; its declared connection is separate from those views.
- `core/applets/definitions/github.ts` and `apple-notes.ts` use different
  connection/host requirements while both declare scene presentation.
- Packaged `commands.json` comes from the existing World gateway (below). Extend
  that source of truth when adding operations, not a parallel executor/schema.
- Generic plugin installation and MCP Apps hosting are not implemented by this
  contract. A first compatibility slice should prove one package, one authorized
  tool, structured results and an isolated Focus UI before broad rollout.

This is a contract clarification, not a claim of new connectors or cross-platform
behavioral parity. No native policy or device behavior changes are made here.

## Integration map

For a generated native Applet, default to `appletSurface`, `actionButton`,
`emptyState` and `notice` from `ui/components/primitives/components.ts`.
Use the [built-in HUD contract](../../resources/styles/builtin/UI.md) rather
than introducing a local palette or image-based controls. The live component
gallery includes an interactive Notes example; Weather is a production route
using the same shell, with live data and explicit unavailable/error states.

| Concern | Starting points |
| --- | --- |
| Catalog and stable IDs | `core/applets/definitions/<key>.ts`, `core/applets/catalog.ts` |
| Brand assets | `ui/applets/BRAND-ASSETS.md`, `ui/applets/brand-assets.json` |
| Placement and world slots | `ui/world/world-layout.ts`, `ui/world/world-pack.ts`, `resources/worlds/`; retain compatible stored IDs |
| Sprite rendering and Open items | `ui/world/pixi-world.ts`, `ui/world/pixi-stage.ts`, Applet-specific renderers |
| Asset packaging | `scripts/build-world-assets.ts`; inspect the active asset paths before registering files |
| Connections | `ui/applets/connection-guide.ts`, host adapters in `platform/electron/src/modules/sources/` (`connections.ts`, `apple.ts`, `local.ts`) and `harness/hermes/` |
| Routing and selected originals | `ui/shell/notion-world.ts` |
| Browser Focus | `ui/browser/browser-device.ts`, host browser module `platform/electron/src/modules/browser/` ([website views](../../platform/browser/INTEGRATION.md#native-browser)); dismiss must unload page/media unless the [resume rule](../../platform/browser/INTEGRATION.md#resuming-a-website-applet) keeps it |
| Fox dialogue and actions | `ui/companion/native-chat.ts`, `ui/hud/native-hud.ts` |
| Focused checks | Existing relevant scripts under `scripts/`; use fictional data for routine UI validation |

## Definition versus user instance

Definitions declare identity, assets, views and operations. Accounts, selected items, sessions, unread counts and running jobs are runtime state. Do not store credentials, private snapshots or invented data in Applet definitions. Sample supplies preset content through the same rendering and navigation paths.

There is no universal installed-Applet loader implied by this guide. The historical `scripts/new-applet-draft.ts` creates an unregistered draft, not a usable installation. A generated image, an available MCP or a successful build alone does not mean Ready.

## Attention registration

An optional typed `attention` declaration registers a trusted source reader or observation producer with the central runtime. See [Applet context and center synthesis](../../core/attention/README.md) for the contract, cost limits and lifecycle. Applets submit source facts; the center synthesizes and decides visibility. Registration alone does not implement a connector, create a background process or grant model access. Observations require stable source identity, original evidence and freshness. Keep acquisition, proposal and user completion separate.

## Autonomous work contract

Every registered Applet needs `applet.md` and `runtime.json` beside its UI files. See [Applet runtime](../../core/applets/RUNTIME.md) for schedules, trusted adapters, source analysis, optional Attention subscription, durable state and lamp behavior. Website Applets declare on-demand behavior rather than fake background work. Run `node scripts/applet-runtime-check.ts` after changing this contract.


### Packaged command discovery

The shared World gateway is the command source of truth. Every Applet exposes an `applet:<key>` target with `launch`, a private `runtime` inspection command in the real world, and its existing specialized actions. These aliases retain the original implementation, typed schema, fixed routing fields and permission checks. `launch` fixes the Applet ID; callers cannot override it. Use `describe_world_tools` and `call_world_tool` as usual.

Packaging writes `commands.json` beside each Applet's `applet.md` and `runtime.json`, generated from that same gateway registry. Do not hand-maintain a second schema or executor in this file. To add a specialized command, register its trusted World tool/action first. Sample omits live source commands; runtime inspection lists saved items and whichever task/operation metadata the host implements, not a promise of live account access.
