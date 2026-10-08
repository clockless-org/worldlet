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

Indexed: **263 Markdown documents** and **39 supporting documentation files**.

| Category | Files |
| --- | ---: |
| Root entry points | 6 |
| Product, architecture and operations guides | 13 |
| Applet runtime descriptions | 119 |
| UI and Applet authoring references | 24 |
| Resource and artwork records | 66 |
| Module and service documentation | 35 |
| Website documentation and articles | 0 |
| Documentation diagrams, previews and evidence | 39 |

<details><summary>Root entry points (6)</summary>

- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [README.md](README.md)
- [README.zh.md](README.zh.md)
- [SECURITY.md](SECURITY.md)

</details>

<details><summary>Product, architecture and operations guides (13)</summary>

- [docs/AGENT-PORTABILITY.md](docs/AGENT-PORTABILITY.md)
- [docs/ANALYTICS.md](docs/ANALYTICS.md)
- [docs/APPLET-RUNTIME.md](docs/APPLET-RUNTIME.md)
- [docs/ATTENTION-CENTER.md](docs/ATTENTION-CENTER.md)
- [docs/CHARTER.md](docs/CHARTER.md)
- [docs/DESIGN.md](docs/DESIGN.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/FOX-AGENT.md](docs/FOX-AGENT.md)
- [docs/LAUNCH-READINESS.md](docs/LAUNCH-READINESS.md)
- [docs/RELEASE-GUIDELINES.md](docs/RELEASE-GUIDELINES.md)
- [docs/UI-CORE-PLATFORM.md](docs/UI-CORE-PLATFORM.md)
- [docs/WORLD-LAYOUT.md](docs/WORLD-LAYOUT.md)
- [docs/WORLD-STORAGE.md](docs/WORLD-STORAGE.md)

</details>

<details><summary>Applet runtime descriptions (119)</summary>

- [ui/applets/acrobat/applet.md](ui/applets/acrobat/applet.md)
- [ui/applets/agar-io/applet.md](ui/applets/agar-io/applet.md)
- [ui/applets/airbnb/applet.md](ui/applets/airbnb/applet.md)
- [ui/applets/alipay/applet.md](ui/applets/alipay/applet.md)
- [ui/applets/amazon/applet.md](ui/applets/amazon/applet.md)
- [ui/applets/apple-music/applet.md](ui/applets/apple-music/applet.md)
- [ui/applets/apple-notes/applet.md](ui/applets/apple-notes/applet.md)
- [ui/applets/apple-podcasts/applet.md](ui/applets/apple-podcasts/applet.md)
- [ui/applets/apple-reminders/applet.md](ui/applets/apple-reminders/applet.md)
- [ui/applets/baidu-netdisk/applet.md](ui/applets/baidu-netdisk/applet.md)
- [ui/applets/bilibili/applet.md](ui/applets/bilibili/applet.md)
- [ui/applets/booking/applet.md](ui/applets/booking/applet.md)
- [ui/applets/browser/applet.md](ui/applets/browser/applet.md)
- [ui/applets/canva/applet.md](ui/applets/canva/applet.md)
- [ui/applets/capcut/applet.md](ui/applets/capcut/applet.md)
- [ui/applets/chatgpt/applet.md](ui/applets/chatgpt/applet.md)
- [ui/applets/claude-code/applet.md](ui/applets/claude-code/applet.md)
- [ui/applets/claude/applet.md](ui/applets/claude/applet.md)
- [ui/applets/cloudflare/applet.md](ui/applets/cloudflare/applet.md)
- [ui/applets/codex/applet.md](ui/applets/codex/applet.md)
- [ui/applets/cookie-clicker/applet.md](ui/applets/cookie-clicker/applet.md)
- [ui/applets/copilot/applet.md](ui/applets/copilot/applet.md)
- [ui/applets/deepseek/applet.md](ui/applets/deepseek/applet.md)
- [ui/applets/discord/applet.md](ui/applets/discord/applet.md)
- [ui/applets/docker/applet.md](ui/applets/docker/applet.md)
- [ui/applets/doordash/applet.md](ui/applets/doordash/applet.md)
- [ui/applets/doubao/applet.md](ui/applets/doubao/applet.md)
- [ui/applets/douyin/applet.md](ui/applets/douyin/applet.md)
- [ui/applets/drive-mad/applet.md](ui/applets/drive-mad/applet.md)
- [ui/applets/dropbox/applet.md](ui/applets/dropbox/applet.md)
- [ui/applets/facebook/applet.md](ui/applets/facebook/applet.md)
- [ui/applets/feishu/applet.md](ui/applets/feishu/applet.md)
- [ui/applets/figma/applet.md](ui/applets/figma/applet.md)
- [ui/applets/firebase/applet.md](ui/applets/firebase/applet.md)
- [ui/applets/fitbit/applet.md](ui/applets/fitbit/applet.md)
- [ui/applets/game-2048/applet.md](ui/applets/game-2048/applet.md)
- [ui/applets/garden/applet.md](ui/applets/garden/applet.md)
- [ui/applets/gemini/applet.md](ui/applets/gemini/applet.md)
- [ui/applets/github/applet.md](ui/applets/github/applet.md)
- [ui/applets/gitlab/applet.md](ui/applets/gitlab/applet.md)
- [ui/applets/gmail/applet.md](ui/applets/gmail/applet.md)
- [ui/applets/google-calendar/applet.md](ui/applets/google-calendar/applet.md)
- [ui/applets/google-docs/applet.md](ui/applets/google-docs/applet.md)
- [ui/applets/google-drive/applet.md](ui/applets/google-drive/applet.md)
- [ui/applets/google-maps/applet.md](ui/applets/google-maps/applet.md)
- [ui/applets/google-photos/applet.md](ui/applets/google-photos/applet.md)
- [ui/applets/google-sheets/applet.md](ui/applets/google-sheets/applet.md)
- [ui/applets/google-slides/applet.md](ui/applets/google-slides/applet.md)
- [ui/applets/infinite-craft/applet.md](ui/applets/infinite-craft/applet.md)
- [ui/applets/instagram/applet.md](ui/applets/instagram/applet.md)
- [ui/applets/jira/applet.md](ui/applets/jira/applet.md)
- [ui/applets/krunker-io/applet.md](ui/applets/krunker-io/applet.md)
- [ui/applets/lichess/applet.md](ui/applets/lichess/applet.md)
- [ui/applets/linear/applet.md](ui/applets/linear/applet.md)
- [ui/applets/linkedin/applet.md](ui/applets/linkedin/applet.md)
- [ui/applets/little-alchemy-2/applet.md](ui/applets/little-alchemy-2/applet.md)
- [ui/applets/meetings/applet.md](ui/applets/meetings/applet.md)
- [ui/applets/messages/applet.md](ui/applets/messages/applet.md)
- [ui/applets/microsoft-excel/applet.md](ui/applets/microsoft-excel/applet.md)
- [ui/applets/microsoft-powerpoint/applet.md](ui/applets/microsoft-powerpoint/applet.md)
- [ui/applets/microsoft-word/applet.md](ui/applets/microsoft-word/applet.md)
- [ui/applets/minesweeper/applet.md](ui/applets/minesweeper/applet.md)
- [ui/applets/netflix/applet.md](ui/applets/netflix/applet.md)
- [ui/applets/netlify/applet.md](ui/applets/netlify/applet.md)
- [ui/applets/notion/applet.md](ui/applets/notion/applet.md)
- [ui/applets/nyt-connections/applet.md](ui/applets/nyt-connections/applet.md)
- [ui/applets/obsidian/applet.md](ui/applets/obsidian/applet.md)
- [ui/applets/onedrive/applet.md](ui/applets/onedrive/applet.md)
- [ui/applets/ongoing/applet.md](ui/applets/ongoing/applet.md)
- [ui/applets/oura/applet.md](ui/applets/oura/applet.md)
- [ui/applets/outlook/applet.md](ui/applets/outlook/applet.md)
- [ui/applets/paypal/applet.md](ui/applets/paypal/applet.md)
- [ui/applets/perplexity/applet.md](ui/applets/perplexity/applet.md)
- [ui/applets/pinterest/applet.md](ui/applets/pinterest/applet.md)
- [ui/applets/plaid/applet.md](ui/applets/plaid/applet.md)
- [ui/applets/pokemon-showdown/applet.md](ui/applets/pokemon-showdown/applet.md)
- [ui/applets/posthog/applet.md](ui/applets/posthog/applet.md)
- [ui/applets/railway/applet.md](ui/applets/railway/applet.md)
- [ui/applets/random-game/applet.md](ui/applets/random-game/applet.md)
- [ui/applets/reddit/applet.md](ui/applets/reddit/applet.md)
- [ui/applets/render/applet.md](ui/applets/render/applet.md)
- [ui/applets/sekai-3d-uno/applet.md](ui/applets/sekai-3d-uno/applet.md)
- [ui/applets/sekai-devil-level/applet.md](ui/applets/sekai-devil-level/applet.md)
- [ui/applets/sekai-mixing-colors/applet.md](ui/applets/sekai-mixing-colors/applet.md)
- [ui/applets/sekai-rogue-ai-tic-tac-toe/applet.md](ui/applets/sekai-rogue-ai-tic-tac-toe/applet.md)
- [ui/applets/sekai-roller-coaster/applet.md](ui/applets/sekai-roller-coaster/applet.md)
- [ui/applets/sekai-sketch-racer/applet.md](ui/applets/sekai-sketch-racer/applet.md)
- [ui/applets/sekai/applet.md](ui/applets/sekai/applet.md)
- [ui/applets/sentry/applet.md](ui/applets/sentry/applet.md)
- [ui/applets/skribbl-io/applet.md](ui/applets/skribbl-io/applet.md)
- [ui/applets/slack/applet.md](ui/applets/slack/applet.md)
- [ui/applets/slither-io/applet.md](ui/applets/slither-io/applet.md)
- [ui/applets/snake/applet.md](ui/applets/snake/applet.md)
- [ui/applets/spotify/applet.md](ui/applets/spotify/applet.md)
- [ui/applets/strava/applet.md](ui/applets/strava/applet.md)
- [ui/applets/stripe/applet.md](ui/applets/stripe/applet.md)
- [ui/applets/subway-surfers/applet.md](ui/applets/subway-surfers/applet.md)
- [ui/applets/sudoku/applet.md](ui/applets/sudoku/applet.md)
- [ui/applets/supabase/applet.md](ui/applets/supabase/applet.md)
- [ui/applets/taobao/applet.md](ui/applets/taobao/applet.md)
- [ui/applets/teams/applet.md](ui/applets/teams/applet.md)
- [ui/applets/telegram/applet.md](ui/applets/telegram/applet.md)
- [ui/applets/threads/applet.md](ui/applets/threads/applet.md)
- [ui/applets/tiktok/applet.md](ui/applets/tiktok/applet.md)
- [ui/applets/todoist/applet.md](ui/applets/todoist/applet.md)
- [ui/applets/tripit/applet.md](ui/applets/tripit/applet.md)
- [ui/applets/twitch/applet.md](ui/applets/twitch/applet.md)
- [ui/applets/uber-eats/applet.md](ui/applets/uber-eats/applet.md)
- [ui/applets/uber/applet.md](ui/applets/uber/applet.md)
- [ui/applets/vercel/applet.md](ui/applets/vercel/applet.md)
- [ui/applets/voice-memos/applet.md](ui/applets/voice-memos/applet.md)
- [ui/applets/weather/applet.md](ui/applets/weather/applet.md)
- [ui/applets/whatsapp/applet.md](ui/applets/whatsapp/applet.md)
- [ui/applets/wikipedia/applet.md](ui/applets/wikipedia/applet.md)
- [ui/applets/wordle/applet.md](ui/applets/wordle/applet.md)
- [ui/applets/x/applet.md](ui/applets/x/applet.md)
- [ui/applets/xiaohongshu/applet.md](ui/applets/xiaohongshu/applet.md)
- [ui/applets/youtube/applet.md](ui/applets/youtube/applet.md)
- [ui/applets/zoom/applet.md](ui/applets/zoom/applet.md)

</details>

<details><summary>UI and Applet authoring references (24)</summary>

- [ui/DESIGN-STANDARDS.md](ui/DESIGN-STANDARDS.md)
- [ui/README.md](ui/README.md)
- [ui/applets/BRAND-ASSETS.md](ui/applets/BRAND-ASSETS.md)
- [ui/applets/DESIGN-GUIDE.md](ui/applets/DESIGN-GUIDE.md)
- [ui/applets/IMPLEMENTATION-GUIDE.md](ui/applets/IMPLEMENTATION-GUIDE.md)
- [ui/applets/MOTION.md](ui/applets/MOTION.md)
- [ui/applets/README.md](ui/applets/README.md)
- [ui/applets/gmail/README.md](ui/applets/gmail/README.md)
- [ui/applets/gmail/prompts/extract.md](ui/applets/gmail/prompts/extract.md)
- [ui/applets/google-calendar/prompts/extract.md](ui/applets/google-calendar/prompts/extract.md)
- [ui/applets/meetings/README.md](ui/applets/meetings/README.md)
- [ui/applets/messages/README.md](ui/applets/messages/README.md)
- [ui/applets/voice-memos/README.md](ui/applets/voice-memos/README.md)
- [ui/attention/CARD-SYSTEM.md](ui/attention/CARD-SYSTEM.md)
- [ui/companion/ANIMATION.md](ui/companion/ANIMATION.md)
- [ui/companion/CONVERSATION.md](ui/companion/CONVERSATION.md)
- [ui/components/INTERACTION.md](ui/components/INTERACTION.md)
- [ui/onboarding/DISCOVERY.md](ui/onboarding/DISCOVERY.md)
- [ui/onboarding/README.md](ui/onboarding/README.md)
- [ui/practice/DEMO.md](ui/practice/DEMO.md)
- [ui/shell/README.md](ui/shell/README.md)
- [ui/world/COMPOSITION.md](ui/world/COMPOSITION.md)
- [ui/world/ENVIRONMENT.md](ui/world/ENVIRONMENT.md)
- [ui/world/README.md](ui/world/README.md)

</details>

<details><summary>Resource and artwork records (66)</summary>

- [resources/README.md](resources/README.md)
- [resources/audio/README.md](resources/audio/README.md)
- [resources/brands/README.md](resources/brands/README.md)
- [resources/styles/builtin/PRODUCTION.md](resources/styles/builtin/PRODUCTION.md)
- [resources/styles/builtin/README.md](resources/styles/builtin/README.md)
- [resources/styles/builtin/STYLE.md](resources/styles/builtin/STYLE.md)
- [resources/styles/builtin/UI.md](resources/styles/builtin/UI.md)
- [resources/styles/builtin/assets/animations/home/README.md](resources/styles/builtin/assets/animations/home/README.md)
- [resources/styles/builtin/assets/applets/EXPLORE-SPRITES.md](resources/styles/builtin/assets/applets/EXPLORE-SPRITES.md)
- [resources/styles/builtin/assets/applets/airbnb/SPRITE-V2.md](resources/styles/builtin/assets/applets/airbnb/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/apple-notes/README.md](resources/styles/builtin/assets/applets/apple-notes/README.md)
- [resources/styles/builtin/assets/applets/apple-reminders/README.md](resources/styles/builtin/assets/applets/apple-reminders/README.md)
- [resources/styles/builtin/assets/applets/fitbit/SPRITE-V2.md](resources/styles/builtin/assets/applets/fitbit/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/gmail/README.md](resources/styles/builtin/assets/applets/gmail/README.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/README.md](resources/styles/builtin/assets/applets/gmail/mail-parts/README.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/attention-board-v2.md](resources/styles/builtin/assets/applets/gmail/mail-parts/attention-board-v2.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v3.md](resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v3.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v4.md](resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v4.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v5.md](resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v5.md)
- [resources/styles/builtin/assets/applets/google-calendar/README.md](resources/styles/builtin/assets/applets/google-calendar/README.md)
- [resources/styles/builtin/assets/applets/google-maps/SPRITE-V2.md](resources/styles/builtin/assets/applets/google-maps/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/notion/README.md](resources/styles/builtin/assets/applets/notion/README.md)
- [resources/styles/builtin/assets/applets/obsidian/README.md](resources/styles/builtin/assets/applets/obsidian/README.md)
- [resources/styles/builtin/assets/applets/oura/SPRITE-V2.md](resources/styles/builtin/assets/applets/oura/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/paypal/SPRITE-V2.md](resources/styles/builtin/assets/applets/paypal/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/plaid/SPRITE-V2.md](resources/styles/builtin/assets/applets/plaid/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/strava/SPRITE-V2.md](resources/styles/builtin/assets/applets/strava/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/stripe/SPRITE-V2.md](resources/styles/builtin/assets/applets/stripe/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/tripit/SPRITE-V2.md](resources/styles/builtin/assets/applets/tripit/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/voice-memos/README.md](resources/styles/builtin/assets/applets/voice-memos/README.md)
- [resources/styles/builtin/assets/applets/weather/README.md](resources/styles/builtin/assets/applets/weather/README.md)
- [resources/styles/builtin/assets/applets/youtube/README.md](resources/styles/builtin/assets/applets/youtube/README.md)
- [resources/styles/builtin/assets/attention/README.md](resources/styles/builtin/assets/attention/README.md)
- [resources/styles/builtin/assets/companion/expressions/README.md](resources/styles/builtin/assets/companion/expressions/README.md)
- [resources/styles/builtin/assets/companion/painted/README.md](resources/styles/builtin/assets/companion/painted/README.md)
- [resources/styles/builtin/assets/companion/rig/README.md](resources/styles/builtin/assets/companion/rig/README.md)
- [resources/styles/builtin/assets/companion/rive/README.md](resources/styles/builtin/assets/companion/rive/README.md)
- [resources/styles/builtin/assets/companion/sprites-v4/README.md](resources/styles/builtin/assets/companion/sprites-v4/README.md)
- [resources/styles/builtin/assets/hud/README.md](resources/styles/builtin/assets/hud/README.md)
- [resources/styles/builtin/assets/hud/country/README.md](resources/styles/builtin/assets/hud/country/README.md)
- [resources/styles/builtin/assets/world/README.md](resources/styles/builtin/assets/world/README.md)
- [resources/styles/builtin/drafts/attention-scenes-v1/README.md](resources/styles/builtin/drafts/attention-scenes-v1/README.md)
- [resources/styles/builtin/drafts/brand-readable/AUDIT.md](resources/styles/builtin/drafts/brand-readable/AUDIT.md)
- [resources/styles/builtin/drafts/fox-painted-idle/README.md](resources/styles/builtin/drafts/fox-painted-idle/README.md)
- [resources/styles/builtin/drafts/fox-states-v1/README.md](resources/styles/builtin/drafts/fox-states-v1/README.md)
- [resources/styles/builtin/drafts/front-facing/README.md](resources/styles/builtin/drafts/front-facing/README.md)
- [resources/styles/builtin/drafts/function-first-30/README.md](resources/styles/builtin/drafts/function-first-30/README.md)
- [resources/styles/builtin/drafts/games/README.md](resources/styles/builtin/drafts/games/README.md)
- [resources/styles/builtin/drafts/gentle-angle/README.md](resources/styles/builtin/drafts/gentle-angle/README.md)
- [resources/styles/builtin/drafts/getty-guide/README.md](resources/styles/builtin/drafts/getty-guide/README.md)
- [resources/styles/builtin/drafts/hud-v1/README.md](resources/styles/builtin/drafts/hud-v1/README.md)
- [resources/styles/builtin/drafts/logo-first/README.md](resources/styles/builtin/drafts/logo-first/README.md)
- [resources/styles/builtin/drafts/logo-rollout/README.md](resources/styles/builtin/drafts/logo-rollout/README.md)
- [resources/styles/builtin/drafts/moment/README.md](resources/styles/builtin/drafts/moment/README.md)
- [resources/styles/builtin/drafts/ongoing/README.md](resources/styles/builtin/drafts/ongoing/README.md)
- [resources/styles/builtin/drafts/remaining-bold/README.md](resources/styles/builtin/drafts/remaining-bold/README.md)
- [resources/styles/builtin/references/browser-focus/README.md](resources/styles/builtin/references/browser-focus/README.md)
- [resources/styles/builtin/references/home-readers/README.md](resources/styles/builtin/references/home-readers/README.md)
- [resources/styles/builtin/references/immersive/README.md](resources/styles/builtin/references/immersive/README.md)
- [resources/styles/builtin/references/village-hud/README.md](resources/styles/builtin/references/village-hud/README.md)
- [resources/styles/builtin/references/youtube-web/README.md](resources/styles/builtin/references/youtube-web/README.md)
- [resources/themes/README.md](resources/themes/README.md)
- [resources/worlds/README.md](resources/worlds/README.md)
- [resources/worlds/village/README.md](resources/worlds/village/README.md)
- [resources/worlds/village/drafts/six-regions/README.md](resources/worlds/village/drafts/six-regions/README.md)
- [resources/worlds/village/images/landmarks/NIGHT.md](resources/worlds/village/images/landmarks/NIGHT.md)

</details>

<details><summary>Module and service documentation (35)</summary>

- [android/README.md](android/README.md)
- [contracts/COMPONENTS.md](contracts/COMPONENTS.md)
- [contracts/HARNESS.md](contracts/HARNESS.md)
- [contracts/README.md](contracts/README.md)
- [core/README.md](core/README.md)
- [core/agent/PORTABILITY.md](core/agent/PORTABILITY.md)
- [core/applets/INTEGRATIONS.md](core/applets/INTEGRATIONS.md)
- [core/applets/MY-APPLETS.md](core/applets/MY-APPLETS.md)
- [core/applets/RUNTIME.md](core/applets/RUNTIME.md)
- [core/artifacts/README.md](core/artifacts/README.md)
- [core/attention/README.md](core/attention/README.md)
- [core/diagnostics/ANALYTICS.md](core/diagnostics/ANALYTICS.md)
- [core/games/README.md](core/games/README.md)
- [core/items/STORAGE.md](core/items/STORAGE.md)
- [core/ongoing/README.md](core/ongoing/README.md)
- [core/phone/README.md](core/phone/README.md)
- [core/widgets/README.md](core/widgets/README.md)
- [harness/README.md](harness/README.md)
- [harness/example/README.md](harness/example/README.md)
- [harness/hermes/GOOGLE-OAUTH-REVIEW.md](harness/hermes/GOOGLE-OAUTH-REVIEW.md)
- [harness/hermes/README.md](harness/hermes/README.md)
- [harness/skills/README.md](harness/skills/README.md)
- [harness/skills/worldlet/SKILL.md](harness/skills/worldlet/SKILL.md)
- [ios/README.md](ios/README.md)
- [platform/README.md](platform/README.md)
- [platform/STEAM.md](platform/STEAM.md)
- [platform/browser/INTEGRATION.md](platform/browser/INTEGRATION.md)
- [platform/browser/README.md](platform/browser/README.md)
- [platform/electron/COMPANION.md](platform/electron/COMPANION.md)
- [platform/electron/DISTRIBUTION.md](platform/electron/DISTRIBUTION.md)
- [platform/electron/README.md](platform/electron/README.md)
- [platform/install/README.md](platform/install/README.md)
- [platform/local-tools/README.md](platform/local-tools/README.md)
- [platform/web-engine/README.md](platform/web-engine/README.md)
- [scripts/DEVELOPMENT.md](scripts/DEVELOPMENT.md)

</details>

<details><summary>Website documentation and articles (0)</summary>


</details>

<details><summary>Documentation diagrams, previews and evidence (39)</summary>

- [core/diagnostics/analytics-insights.json](core/diagnostics/analytics-insights.json)
- [docs/architecture.html](docs/architecture.html)
- [docs/stack-in-computer-terms.svg](docs/stack-in-computer-terms.svg)
- [docs/stack-in-computer-terms.zh.svg](docs/stack-in-computer-terms.zh.svg)
- [platform/distribution/index.html](platform/distribution/index.html)
- [resources/styles/builtin/references/brand/preview.html](resources/styles/builtin/references/brand/preview.html)
- [resources/styles/builtin/references/brand/system.html](resources/styles/builtin/references/brand/system.html)
- [resources/styles/builtin/references/browser-focus/index.html](resources/styles/builtin/references/browser-focus/index.html)
- [resources/styles/builtin/references/companion/evidence/active-states-webkit-dark.png](resources/styles/builtin/references/companion/evidence/active-states-webkit-dark.png)
- [resources/styles/builtin/references/companion/evidence/active-states-webkit.png](resources/styles/builtin/references/companion/evidence/active-states-webkit.png)
- [resources/styles/builtin/references/companion/evidence/greeting-wrist.png](resources/styles/builtin/references/companion/evidence/greeting-wrist.png)
- [resources/styles/builtin/references/companion/evidence/lap-book-delight.png](resources/styles/builtin/references/companion/evidence/lap-book-delight.png)
- [resources/styles/builtin/references/companion/evidence/lap-book-hud.png](resources/styles/builtin/references/companion/evidence/lap-book-hud.png)
- [resources/styles/builtin/references/companion/evidence/mixed-props.png](resources/styles/builtin/references/companion/evidence/mixed-props.png)
- [resources/styles/builtin/references/companion/evidence/occupied-attention.png](resources/styles/builtin/references/companion/evidence/occupied-attention.png)
- [resources/styles/builtin/references/companion/evidence/paw-shape-after.png](resources/styles/builtin/references/companion/evidence/paw-shape-after.png)
- [resources/styles/builtin/references/companion/evidence/paw-shape-before.png](resources/styles/builtin/references/companion/evidence/paw-shape-before.png)
- [resources/styles/builtin/references/companion/evidence/paw-side-thickness.png](resources/styles/builtin/references/companion/evidence/paw-side-thickness.png)
- [resources/styles/builtin/references/companion/evidence/social-phrases-webkit.png](resources/styles/builtin/references/companion/evidence/social-phrases-webkit.png)
- [resources/styles/builtin/references/companion/evidence/working-close-depth-fix.png](resources/styles/builtin/references/companion/evidence/working-close-depth-fix.png)
- [resources/styles/builtin/references/companion/evidence/working-close-draft.png](resources/styles/builtin/references/companion/evidence/working-close-draft.png)
- [resources/styles/builtin/references/companion/evidence/working-handling.png](resources/styles/builtin/references/companion/evidence/working-handling.png)
- [resources/styles/builtin/references/companion/evidence/working-runtime.png](resources/styles/builtin/references/companion/evidence/working-runtime.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-handling.png](resources/styles/builtin/references/companion/evidence/working-stow-handling.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-runtime-paced.png](resources/styles/builtin/references/companion/evidence/working-stow-runtime-paced.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-runtime.png](resources/styles/builtin/references/companion/evidence/working-stow-runtime.png)
- [resources/styles/builtin/references/companion/evidence/working-stow.png](resources/styles/builtin/references/companion/evidence/working-stow.png)
- [resources/styles/builtin/references/companion/index.html](resources/styles/builtin/references/companion/index.html)
- [resources/styles/builtin/references/day.png](resources/styles/builtin/references/day.png)
- [resources/styles/builtin/references/home-readers/open-focus-v1.png](resources/styles/builtin/references/home-readers/open-focus-v1.png)
- [resources/styles/builtin/references/immersive/composition.json](resources/styles/builtin/references/immersive/composition.json)
- [resources/styles/builtin/references/immersive/final-validation.json](resources/styles/builtin/references/immersive/final-validation.json)
- [resources/styles/builtin/references/immersive/use-case-audit.json](resources/styles/builtin/references/immersive/use-case-audit.json)
- [resources/styles/builtin/references/immersive/use-cases.json](resources/styles/builtin/references/immersive/use-cases.json)
- [resources/styles/builtin/references/night.png](resources/styles/builtin/references/night.png)
- [resources/styles/builtin/references/village-hud/components.png](resources/styles/builtin/references/village-hud/components.png)
- [resources/styles/builtin/references/village-hud/weather.png](resources/styles/builtin/references/village-hud/weather.png)
- [resources/styles/builtin/references/youtube-web/focus-concept.png](resources/styles/builtin/references/youtube-web/focus-concept.png)
- [resources/styles/builtin/references/youtube-web/peek-focus-concept.png](resources/styles/builtin/references/youtube-web/peek-focus-concept.png)

</details>

<!-- documentation-inventory:end -->
