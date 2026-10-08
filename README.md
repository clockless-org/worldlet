# Worldlet

Worldlet is a desktop World for the AI Agent you already use. It runs on top of your own Agent (OpenClaw, Hermes Agent, Claude Code, Codex or pi), borrows its sign-ins, model and memory, and gives it a place to work that you can see: a small dimensional world of places and Applets, an Attention Center for what needs you, and Fox, the companion you talk to.

The World is operated by AI; you watch and decide. Mac and Windows, with iPhone and Android companions.

- License: [Apache License 2.0](LICENSE) · third-party notices: [NOTICE](NOTICE)
- [Contributing](CONTRIBUTING.md) · [security reports](SECURITY.md) · [Chinese README](README.zh.md)

## Who it is for

People who already run an Agent. Everything you did with it keeps working: Worldlet talks through your Agent, uses the connections and skills it already has, and syncs its history into the World. If you have no Agent yet, Worldlet installs a standard [Hermes Agent](core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup) for you on first launch.

Worldlet provides no model of its own. Fox runs on what is already on your computer: your Agent, a Codex sign-in or your own API key.

## The stack in computer terms

| Computer | AI era | Who owns it |
| --- | --- | --- |
| CPU | Model | Your model provider (your own sign-in or API key) |
| Kernel | Harness: Hermes Agent, OpenClaw, Claude Code, Codex, pi | Your choice, replaceable |
| Drivers and keychain | MCP servers, connectors and their tokens | Your Harness; Worldlet borrows them |
| Terminal | Chat apps and command lines | Where Agents live today |
| Graphical system | Worldlet: World, Applets, Fox, Attention Center | This project |
| System API | World tools, served to the Agent over the `worldlet` MCP server | This project |
| Disk | `world.sqlite` and World storage, on your computer | This project |

World → Agent tools go over MCP; Agent → World goes through one adapter per Harness ([Harness contract](contracts/HARNESS.md), [interactive architecture diagram](docs/architecture.html)).

## Install

Signed builds for Mac and Windows are on [worldlet.ai](https://worldlet.ai/download/) (invite code during the preview). Builds are signed release artifacts of a tagged commit of this repository.

## Build from source

Requirements: Node.js 22.19 or later.

```sh
npm ci
npm run setup:hermes   # pinned Hermes runtime for Fox when no other Agent is chosen
npm run dev            # development build with a watcher
npm run build          # build the interface and the Electron host once
npm run package        # package the desktop app for this OS (unsigned)
```

No account, secret or hosted service is needed to build. Checks: `npm run check:pr` (types, architecture and contract boundaries, docs, source layout, style) and `npm test`.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `ui/` | Shared rendering and interaction: World, Applets, Fox, Attention Center |
| `core/` | Platform-independent product rules and data |
| `platform/` | The Electron host: OS integration, browser engine, controlled execution |
| `harness/` | Agent backends and the reference Harness adapter |
| `contracts/` | Shared Host/Agent interfaces and data shapes |
| `resources/` | Worlds, styles, artwork, fonts and media |
| `ios/`, `android/` | Phone companions: Attention Center and Fox, paired with the computer by QR code through an end-to-end encrypted relay |
| `scripts/`, `docs/` | Build, validation and contributor guidance |

## Privacy

Local first: there is no Worldlet account, and your records stay in `world.sqlite` on your computer. Official builds report basic usage analytics (setup, connection and core-operation outcomes, never message content, connected content or browsing history) and can be turned off in Settings › Privacy; see [analytics](core/diagnostics/ANALYTICS.md). Builds you make yourself report nothing unless you configure a PostHog project.

## Documentation index

| Topic | Entry |
| --- | --- |
| Product principles | [Charter](docs/CHARTER.md) |
| Five layers and component boundaries | [Architecture](docs/UI-CORE-PLATFORM.md) · [diagram](docs/architecture.html) |
| Interaction, HUD and Applet states | [Design](docs/DESIGN.md) |
| World composition and environment | [World layout](docs/WORLD-LAYOUT.md) |
| Applet lifecycle and execution | [Applet runtime](docs/APPLET-RUNTIME.md) |
| Grounded findings and item lifecycle | [Attention Center](docs/ATTENTION-CENTER.md) |
| Fox conversation and assistance | [Fox](docs/FOX-AGENT.md) |
| Harness replacement and portable records | [Agent portability](docs/AGENT-PORTABILITY.md) |
| Data ownership and lifecycle | [World storage](docs/WORLD-STORAGE.md) |
| Contribution and verification | [Development](docs/DEVELOPMENT.md) |
| Applet authoring | [Design guide](ui/applets/DESIGN-GUIDE.md) · [implementation guide](ui/applets/IMPLEMENTATION-GUIDE.md) |

### Complete inventory

The generated inventory lists every Markdown file in the repository.

<!-- documentation-inventory:start -->
<!-- documentation-inventory:end -->
