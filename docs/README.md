# Worldlet documentation

The [README](../README.md) says what Worldlet is and how to install it. This page is the map of everything else: start with the guide for what you want to do, and follow its links into the module documents, which are the source of truth for their own code.

## Using Worldlet

| You want to | Read |
| --- | --- |
| Install with one command, or let your Agent install it | [One-line installers](../platform/install/README.md) · [the `worldlet` skill for Agents](../harness/skills/worldlet/SKILL.md) |
| Connect the Agent you already run (OpenClaw, Hermes Agent, Claude Code, Codex, pi) | [Portable Agent architecture](../core/agent/PORTABILITY.md) · [Harness independence and data ownership](AGENT-PORTABILITY.md) |
| Know what Fox does and how far it goes on its own | [Fox: conversation and assistance](FOX-AGENT.md) |
| Know why something shows up in the Attention Center | [Attention Center](ATTENTION-CENTER.md) |
| Pair your phone | [iPhone](../ios/README.md) · [Android](../android/README.md) |
| Know what is stored on your computer and what is reported | [World data and lifecycle](WORLD-STORAGE.md) · [Analytics](../core/diagnostics/ANALYTICS.md) |

## How it works

| Topic | Read |
| --- | --- |
| The principles everything is designed by | [Charter](CHARTER.md) |
| The stack in computer terms, as a picture | [Stack diagram](stack-in-computer-terms.svg) ([Chinese](stack-in-computer-terms.zh.svg)) · [interactive architecture diagram](architecture.html) |
| Five runtime layers: UI, Core, Platform, Harness, Models | [Five-layer architecture](UI-CORE-PLATFORM.md) · [shared UI, pure Core, thin Platform](../contracts/COMPONENTS.md) |
| How Worldlet talks to an Agent, and an Agent to the World | [Platform–Harness contract](../contracts/HARNESS.md) · [Agent adapters](../harness/README.md) |
| Interaction, HUD and Applet states | [Product interaction design](DESIGN.md) |
| How the World is composed | [World and environment design](WORLD-LAYOUT.md) |
| Applet lifecycle and execution | [Applet runtime](APPLET-RUNTIME.md) · [Core runtime](../core/applets/RUNTIME.md) |
| The desktop host and its browser | [Electron host](../platform/electron/README.md) · [browser](../platform/browser/README.md) |

## Building Applets and Worlds

| Topic | Read |
| --- | --- |
| Where Applet code lives | [Worldlet Applets](../ui/applets/README.md) |
| How an Applet should look and behave | [Applet design guide](../ui/applets/DESIGN-GUIDE.md) · [motion](../ui/applets/MOTION.md) |
| How to build one | [Applet implementation guide](../ui/applets/IMPLEMENTATION-GUIDE.md) · [integrations](../core/applets/INTEGRATIONS.md) |
| Cards Fox makes | [Card system](../ui/attention/CARD-SYSTEM.md) |
| Worlds, styles and artwork | [Resources](../resources/README.md) · [Village world](../resources/worlds/village/README.md) |

## Contributing and releasing

| Topic | Read |
| --- | --- |
| Rules for every change | [Contributing](../CONTRIBUTING.md) · [Working in this repository](../AGENTS.md) |
| Building, checks and tests | [Development workflow](DEVELOPMENT.md) · [development and release scripts](../scripts/DEVELOPMENT.md) |
| Dev, Alpha, Beta and GA builds | [Releasing from GitHub Actions](RELEASING.md) · [desktop distribution](../platform/electron/DISTRIBUTION.md) |
| Security reports | [Security](../SECURITY.md) |

The README's screenshots come from the sample world, which holds only fictional records and needs no model or account: `npm run build:native-ui`, then `node scripts/readme-screenshots.ts` (set `CHROMIUM_PATH` when Playwright's own browser is not installed) rewrites [docs/assets/readme](assets/readme).

## Complete inventory

The generated inventory lists every Markdown file in the repository. `npm run check:docs` fails when it is stale; `node scripts/docs-check.ts --write-index` rewrites it.

<!-- documentation-inventory:start -->

Indexed: **266 Markdown documents** and **43 supporting documentation files**.

| Category | Files |
| --- | ---: |
| Root entry points | 6 |
| Product, architecture and operations guides | 16 |
| Applet runtime descriptions | 119 |
| UI and Applet authoring references | 25 |
| Resource and artwork records | 67 |
| Module and service documentation | 33 |
| Website documentation and articles | 0 |
| Documentation diagrams, previews and evidence | 43 |

<details><summary>Root entry points (6)</summary>

- [AGENTS.md](../AGENTS.md)
- [CLAUDE.md](../CLAUDE.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [README.md](../README.md)
- [README.zh.md](../README.zh.md)
- [SECURITY.md](../SECURITY.md)

</details>

<details><summary>Product, architecture and operations guides (16)</summary>

- [docs/AGENT-PORTABILITY.md](AGENT-PORTABILITY.md)
- [docs/ANALYTICS.md](ANALYTICS.md)
- [docs/APPLET-RUNTIME.md](APPLET-RUNTIME.md)
- [docs/ATTENTION-CENTER.md](ATTENTION-CENTER.md)
- [docs/CHARTER.md](CHARTER.md)
- [docs/DESIGN.md](DESIGN.md)
- [docs/DEVELOPMENT.md](DEVELOPMENT.md)
- [docs/FOX-AGENT.md](FOX-AGENT.md)
- [docs/GOOGLE-OAUTH-REVIEW.md](GOOGLE-OAUTH-REVIEW.md)
- [docs/LAUNCH-READINESS.md](LAUNCH-READINESS.md)
- [docs/README.md](README.md)
- [docs/RELEASE-GUIDELINES.md](RELEASE-GUIDELINES.md)
- [docs/RELEASING.md](RELEASING.md)
- [docs/UI-CORE-PLATFORM.md](UI-CORE-PLATFORM.md)
- [docs/WORLD-LAYOUT.md](WORLD-LAYOUT.md)
- [docs/WORLD-STORAGE.md](WORLD-STORAGE.md)

</details>

<details><summary>Applet runtime descriptions (119)</summary>

- [ui/applets/acrobat/applet.md](../ui/applets/acrobat/applet.md)
- [ui/applets/agar-io/applet.md](../ui/applets/agar-io/applet.md)
- [ui/applets/airbnb/applet.md](../ui/applets/airbnb/applet.md)
- [ui/applets/alipay/applet.md](../ui/applets/alipay/applet.md)
- [ui/applets/amazon/applet.md](../ui/applets/amazon/applet.md)
- [ui/applets/apple-music/applet.md](../ui/applets/apple-music/applet.md)
- [ui/applets/apple-notes/applet.md](../ui/applets/apple-notes/applet.md)
- [ui/applets/apple-podcasts/applet.md](../ui/applets/apple-podcasts/applet.md)
- [ui/applets/apple-reminders/applet.md](../ui/applets/apple-reminders/applet.md)
- [ui/applets/baidu-netdisk/applet.md](../ui/applets/baidu-netdisk/applet.md)
- [ui/applets/bilibili/applet.md](../ui/applets/bilibili/applet.md)
- [ui/applets/booking/applet.md](../ui/applets/booking/applet.md)
- [ui/applets/browser/applet.md](../ui/applets/browser/applet.md)
- [ui/applets/canva/applet.md](../ui/applets/canva/applet.md)
- [ui/applets/capcut/applet.md](../ui/applets/capcut/applet.md)
- [ui/applets/chatgpt/applet.md](../ui/applets/chatgpt/applet.md)
- [ui/applets/claude-code/applet.md](../ui/applets/claude-code/applet.md)
- [ui/applets/claude/applet.md](../ui/applets/claude/applet.md)
- [ui/applets/cloudflare/applet.md](../ui/applets/cloudflare/applet.md)
- [ui/applets/codex/applet.md](../ui/applets/codex/applet.md)
- [ui/applets/cookie-clicker/applet.md](../ui/applets/cookie-clicker/applet.md)
- [ui/applets/copilot/applet.md](../ui/applets/copilot/applet.md)
- [ui/applets/deepseek/applet.md](../ui/applets/deepseek/applet.md)
- [ui/applets/discord/applet.md](../ui/applets/discord/applet.md)
- [ui/applets/docker/applet.md](../ui/applets/docker/applet.md)
- [ui/applets/doordash/applet.md](../ui/applets/doordash/applet.md)
- [ui/applets/doubao/applet.md](../ui/applets/doubao/applet.md)
- [ui/applets/douyin/applet.md](../ui/applets/douyin/applet.md)
- [ui/applets/drive-mad/applet.md](../ui/applets/drive-mad/applet.md)
- [ui/applets/dropbox/applet.md](../ui/applets/dropbox/applet.md)
- [ui/applets/facebook/applet.md](../ui/applets/facebook/applet.md)
- [ui/applets/feishu/applet.md](../ui/applets/feishu/applet.md)
- [ui/applets/figma/applet.md](../ui/applets/figma/applet.md)
- [ui/applets/firebase/applet.md](../ui/applets/firebase/applet.md)
- [ui/applets/fitbit/applet.md](../ui/applets/fitbit/applet.md)
- [ui/applets/game-2048/applet.md](../ui/applets/game-2048/applet.md)
- [ui/applets/garden/applet.md](../ui/applets/garden/applet.md)
- [ui/applets/gemini/applet.md](../ui/applets/gemini/applet.md)
- [ui/applets/github/applet.md](../ui/applets/github/applet.md)
- [ui/applets/gitlab/applet.md](../ui/applets/gitlab/applet.md)
- [ui/applets/gmail/applet.md](../ui/applets/gmail/applet.md)
- [ui/applets/google-calendar/applet.md](../ui/applets/google-calendar/applet.md)
- [ui/applets/google-docs/applet.md](../ui/applets/google-docs/applet.md)
- [ui/applets/google-drive/applet.md](../ui/applets/google-drive/applet.md)
- [ui/applets/google-maps/applet.md](../ui/applets/google-maps/applet.md)
- [ui/applets/google-photos/applet.md](../ui/applets/google-photos/applet.md)
- [ui/applets/google-sheets/applet.md](../ui/applets/google-sheets/applet.md)
- [ui/applets/google-slides/applet.md](../ui/applets/google-slides/applet.md)
- [ui/applets/infinite-craft/applet.md](../ui/applets/infinite-craft/applet.md)
- [ui/applets/instagram/applet.md](../ui/applets/instagram/applet.md)
- [ui/applets/jira/applet.md](../ui/applets/jira/applet.md)
- [ui/applets/krunker-io/applet.md](../ui/applets/krunker-io/applet.md)
- [ui/applets/lichess/applet.md](../ui/applets/lichess/applet.md)
- [ui/applets/linear/applet.md](../ui/applets/linear/applet.md)
- [ui/applets/linkedin/applet.md](../ui/applets/linkedin/applet.md)
- [ui/applets/little-alchemy-2/applet.md](../ui/applets/little-alchemy-2/applet.md)
- [ui/applets/meetings/applet.md](../ui/applets/meetings/applet.md)
- [ui/applets/messages/applet.md](../ui/applets/messages/applet.md)
- [ui/applets/microsoft-excel/applet.md](../ui/applets/microsoft-excel/applet.md)
- [ui/applets/microsoft-powerpoint/applet.md](../ui/applets/microsoft-powerpoint/applet.md)
- [ui/applets/microsoft-word/applet.md](../ui/applets/microsoft-word/applet.md)
- [ui/applets/minesweeper/applet.md](../ui/applets/minesweeper/applet.md)
- [ui/applets/netflix/applet.md](../ui/applets/netflix/applet.md)
- [ui/applets/netlify/applet.md](../ui/applets/netlify/applet.md)
- [ui/applets/notion/applet.md](../ui/applets/notion/applet.md)
- [ui/applets/nyt-connections/applet.md](../ui/applets/nyt-connections/applet.md)
- [ui/applets/obsidian/applet.md](../ui/applets/obsidian/applet.md)
- [ui/applets/onedrive/applet.md](../ui/applets/onedrive/applet.md)
- [ui/applets/ongoing/applet.md](../ui/applets/ongoing/applet.md)
- [ui/applets/oura/applet.md](../ui/applets/oura/applet.md)
- [ui/applets/outlook/applet.md](../ui/applets/outlook/applet.md)
- [ui/applets/paypal/applet.md](../ui/applets/paypal/applet.md)
- [ui/applets/perplexity/applet.md](../ui/applets/perplexity/applet.md)
- [ui/applets/pinterest/applet.md](../ui/applets/pinterest/applet.md)
- [ui/applets/plaid/applet.md](../ui/applets/plaid/applet.md)
- [ui/applets/pokemon-showdown/applet.md](../ui/applets/pokemon-showdown/applet.md)
- [ui/applets/posthog/applet.md](../ui/applets/posthog/applet.md)
- [ui/applets/railway/applet.md](../ui/applets/railway/applet.md)
- [ui/applets/random-game/applet.md](../ui/applets/random-game/applet.md)
- [ui/applets/reddit/applet.md](../ui/applets/reddit/applet.md)
- [ui/applets/render/applet.md](../ui/applets/render/applet.md)
- [ui/applets/sekai-3d-uno/applet.md](../ui/applets/sekai-3d-uno/applet.md)
- [ui/applets/sekai-devil-level/applet.md](../ui/applets/sekai-devil-level/applet.md)
- [ui/applets/sekai-mixing-colors/applet.md](../ui/applets/sekai-mixing-colors/applet.md)
- [ui/applets/sekai-rogue-ai-tic-tac-toe/applet.md](../ui/applets/sekai-rogue-ai-tic-tac-toe/applet.md)
- [ui/applets/sekai-roller-coaster/applet.md](../ui/applets/sekai-roller-coaster/applet.md)
- [ui/applets/sekai-sketch-racer/applet.md](../ui/applets/sekai-sketch-racer/applet.md)
- [ui/applets/sekai/applet.md](../ui/applets/sekai/applet.md)
- [ui/applets/sentry/applet.md](../ui/applets/sentry/applet.md)
- [ui/applets/skribbl-io/applet.md](../ui/applets/skribbl-io/applet.md)
- [ui/applets/slack/applet.md](../ui/applets/slack/applet.md)
- [ui/applets/slither-io/applet.md](../ui/applets/slither-io/applet.md)
- [ui/applets/snake/applet.md](../ui/applets/snake/applet.md)
- [ui/applets/spotify/applet.md](../ui/applets/spotify/applet.md)
- [ui/applets/strava/applet.md](../ui/applets/strava/applet.md)
- [ui/applets/stripe/applet.md](../ui/applets/stripe/applet.md)
- [ui/applets/subway-surfers/applet.md](../ui/applets/subway-surfers/applet.md)
- [ui/applets/sudoku/applet.md](../ui/applets/sudoku/applet.md)
- [ui/applets/supabase/applet.md](../ui/applets/supabase/applet.md)
- [ui/applets/taobao/applet.md](../ui/applets/taobao/applet.md)
- [ui/applets/teams/applet.md](../ui/applets/teams/applet.md)
- [ui/applets/telegram/applet.md](../ui/applets/telegram/applet.md)
- [ui/applets/threads/applet.md](../ui/applets/threads/applet.md)
- [ui/applets/tiktok/applet.md](../ui/applets/tiktok/applet.md)
- [ui/applets/todoist/applet.md](../ui/applets/todoist/applet.md)
- [ui/applets/tripit/applet.md](../ui/applets/tripit/applet.md)
- [ui/applets/twitch/applet.md](../ui/applets/twitch/applet.md)
- [ui/applets/uber-eats/applet.md](../ui/applets/uber-eats/applet.md)
- [ui/applets/uber/applet.md](../ui/applets/uber/applet.md)
- [ui/applets/vercel/applet.md](../ui/applets/vercel/applet.md)
- [ui/applets/voice-memos/applet.md](../ui/applets/voice-memos/applet.md)
- [ui/applets/weather/applet.md](../ui/applets/weather/applet.md)
- [ui/applets/whatsapp/applet.md](../ui/applets/whatsapp/applet.md)
- [ui/applets/wikipedia/applet.md](../ui/applets/wikipedia/applet.md)
- [ui/applets/wordle/applet.md](../ui/applets/wordle/applet.md)
- [ui/applets/x/applet.md](../ui/applets/x/applet.md)
- [ui/applets/xiaohongshu/applet.md](../ui/applets/xiaohongshu/applet.md)
- [ui/applets/youtube/applet.md](../ui/applets/youtube/applet.md)
- [ui/applets/zoom/applet.md](../ui/applets/zoom/applet.md)

</details>

<details><summary>UI and Applet authoring references (25)</summary>

- [ui/DESIGN-STANDARDS.md](../ui/DESIGN-STANDARDS.md)
- [ui/README.md](../ui/README.md)
- [ui/applets/BRAND-ASSETS.md](../ui/applets/BRAND-ASSETS.md)
- [ui/applets/DESIGN-GUIDE.md](../ui/applets/DESIGN-GUIDE.md)
- [ui/applets/IMPLEMENTATION-GUIDE.md](../ui/applets/IMPLEMENTATION-GUIDE.md)
- [ui/applets/MOTION.md](../ui/applets/MOTION.md)
- [ui/applets/README.md](../ui/applets/README.md)
- [ui/applets/gmail/README.md](../ui/applets/gmail/README.md)
- [ui/applets/gmail/prompts/extract.md](../ui/applets/gmail/prompts/extract.md)
- [ui/applets/google-calendar/prompts/extract.md](../ui/applets/google-calendar/prompts/extract.md)
- [ui/applets/meetings/README.md](../ui/applets/meetings/README.md)
- [ui/applets/messages/README.md](../ui/applets/messages/README.md)
- [ui/applets/voice-memos/README.md](../ui/applets/voice-memos/README.md)
- [ui/attention/CARD-SYSTEM.md](../ui/attention/CARD-SYSTEM.md)
- [ui/companion/ANIMATION.md](../ui/companion/ANIMATION.md)
- [ui/companion/CONVERSATION.md](../ui/companion/CONVERSATION.md)
- [ui/components/INTERACTION.md](../ui/components/INTERACTION.md)
- [ui/onboarding/DISCOVERY.md](../ui/onboarding/DISCOVERY.md)
- [ui/onboarding/README.md](../ui/onboarding/README.md)
- [ui/practice/DEMO.md](../ui/practice/DEMO.md)
- [ui/shell/README.md](../ui/shell/README.md)
- [ui/theme-packages/village/assets/README.md](../ui/theme-packages/village/assets/README.md)
- [ui/world/COMPOSITION.md](../ui/world/COMPOSITION.md)
- [ui/world/ENVIRONMENT.md](../ui/world/ENVIRONMENT.md)
- [ui/world/README.md](../ui/world/README.md)

</details>

<details><summary>Resource and artwork records (67)</summary>

- [resources/README.md](../resources/README.md)
- [resources/audio/README.md](../resources/audio/README.md)
- [resources/brands/README.md](../resources/brands/README.md)
- [resources/styles/builtin/PRODUCTION.md](../resources/styles/builtin/PRODUCTION.md)
- [resources/styles/builtin/README.md](../resources/styles/builtin/README.md)
- [resources/styles/builtin/STYLE.md](../resources/styles/builtin/STYLE.md)
- [resources/styles/builtin/UI.md](../resources/styles/builtin/UI.md)
- [resources/styles/builtin/assets/animations/home/README.md](../resources/styles/builtin/assets/animations/home/README.md)
- [resources/styles/builtin/assets/applets/EXPLORE-SPRITES.md](../resources/styles/builtin/assets/applets/EXPLORE-SPRITES.md)
- [resources/styles/builtin/assets/applets/airbnb/SPRITE-V2.md](../resources/styles/builtin/assets/applets/airbnb/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/apple-notes/README.md](../resources/styles/builtin/assets/applets/apple-notes/README.md)
- [resources/styles/builtin/assets/applets/apple-reminders/README.md](../resources/styles/builtin/assets/applets/apple-reminders/README.md)
- [resources/styles/builtin/assets/applets/fitbit/SPRITE-V2.md](../resources/styles/builtin/assets/applets/fitbit/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/gmail/README.md](../resources/styles/builtin/assets/applets/gmail/README.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/README.md](../resources/styles/builtin/assets/applets/gmail/mail-parts/README.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/attention-board-v2.md](../resources/styles/builtin/assets/applets/gmail/mail-parts/attention-board-v2.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v3.md](../resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v3.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v4.md](../resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v4.md)
- [resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v5.md](../resources/styles/builtin/assets/applets/gmail/mail-parts/wall-board-v5.md)
- [resources/styles/builtin/assets/applets/google-calendar/README.md](../resources/styles/builtin/assets/applets/google-calendar/README.md)
- [resources/styles/builtin/assets/applets/google-maps/SPRITE-V2.md](../resources/styles/builtin/assets/applets/google-maps/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/notion/README.md](../resources/styles/builtin/assets/applets/notion/README.md)
- [resources/styles/builtin/assets/applets/obsidian/README.md](../resources/styles/builtin/assets/applets/obsidian/README.md)
- [resources/styles/builtin/assets/applets/oura/SPRITE-V2.md](../resources/styles/builtin/assets/applets/oura/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/paypal/SPRITE-V2.md](../resources/styles/builtin/assets/applets/paypal/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/plaid/SPRITE-V2.md](../resources/styles/builtin/assets/applets/plaid/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/strava/SPRITE-V2.md](../resources/styles/builtin/assets/applets/strava/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/stripe/SPRITE-V2.md](../resources/styles/builtin/assets/applets/stripe/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/tripit/SPRITE-V2.md](../resources/styles/builtin/assets/applets/tripit/SPRITE-V2.md)
- [resources/styles/builtin/assets/applets/voice-memos/README.md](../resources/styles/builtin/assets/applets/voice-memos/README.md)
- [resources/styles/builtin/assets/applets/weather/README.md](../resources/styles/builtin/assets/applets/weather/README.md)
- [resources/styles/builtin/assets/applets/youtube/README.md](../resources/styles/builtin/assets/applets/youtube/README.md)
- [resources/styles/builtin/assets/attention/README.md](../resources/styles/builtin/assets/attention/README.md)
- [resources/styles/builtin/assets/companion/expressions/README.md](../resources/styles/builtin/assets/companion/expressions/README.md)
- [resources/styles/builtin/assets/companion/painted/README.md](../resources/styles/builtin/assets/companion/painted/README.md)
- [resources/styles/builtin/assets/companion/rig/README.md](../resources/styles/builtin/assets/companion/rig/README.md)
- [resources/styles/builtin/assets/companion/rive/README.md](../resources/styles/builtin/assets/companion/rive/README.md)
- [resources/styles/builtin/assets/companion/sprites-v4/README.md](../resources/styles/builtin/assets/companion/sprites-v4/README.md)
- [resources/styles/builtin/assets/hud/README.md](../resources/styles/builtin/assets/hud/README.md)
- [resources/styles/builtin/assets/hud/country/README.md](../resources/styles/builtin/assets/hud/country/README.md)
- [resources/styles/builtin/assets/world/README.md](../resources/styles/builtin/assets/world/README.md)
- [resources/styles/builtin/drafts/attention-scenes-v1/README.md](../resources/styles/builtin/drafts/attention-scenes-v1/README.md)
- [resources/styles/builtin/drafts/brand-readable/AUDIT.md](../resources/styles/builtin/drafts/brand-readable/AUDIT.md)
- [resources/styles/builtin/drafts/fox-painted-idle/README.md](../resources/styles/builtin/drafts/fox-painted-idle/README.md)
- [resources/styles/builtin/drafts/fox-states-v1/README.md](../resources/styles/builtin/drafts/fox-states-v1/README.md)
- [resources/styles/builtin/drafts/front-facing/README.md](../resources/styles/builtin/drafts/front-facing/README.md)
- [resources/styles/builtin/drafts/function-first-30/README.md](../resources/styles/builtin/drafts/function-first-30/README.md)
- [resources/styles/builtin/drafts/games/README.md](../resources/styles/builtin/drafts/games/README.md)
- [resources/styles/builtin/drafts/gentle-angle/README.md](../resources/styles/builtin/drafts/gentle-angle/README.md)
- [resources/styles/builtin/drafts/getty-guide/README.md](../resources/styles/builtin/drafts/getty-guide/README.md)
- [resources/styles/builtin/drafts/hud-v1/README.md](../resources/styles/builtin/drafts/hud-v1/README.md)
- [resources/styles/builtin/drafts/logo-first/README.md](../resources/styles/builtin/drafts/logo-first/README.md)
- [resources/styles/builtin/drafts/logo-rollout/README.md](../resources/styles/builtin/drafts/logo-rollout/README.md)
- [resources/styles/builtin/drafts/moment/README.md](../resources/styles/builtin/drafts/moment/README.md)
- [resources/styles/builtin/drafts/ongoing/README.md](../resources/styles/builtin/drafts/ongoing/README.md)
- [resources/styles/builtin/drafts/remaining-bold/README.md](../resources/styles/builtin/drafts/remaining-bold/README.md)
- [resources/styles/builtin/references/browser-focus/README.md](../resources/styles/builtin/references/browser-focus/README.md)
- [resources/styles/builtin/references/home-readers/README.md](../resources/styles/builtin/references/home-readers/README.md)
- [resources/styles/builtin/references/immersive/README.md](../resources/styles/builtin/references/immersive/README.md)
- [resources/styles/builtin/references/village-hud/README.md](../resources/styles/builtin/references/village-hud/README.md)
- [resources/styles/builtin/references/youtube-web/README.md](../resources/styles/builtin/references/youtube-web/README.md)
- [resources/themes/CONTRACT.md](../resources/themes/CONTRACT.md)
- [resources/themes/README.md](../resources/themes/README.md)
- [resources/worlds/README.md](../resources/worlds/README.md)
- [resources/worlds/village/README.md](../resources/worlds/village/README.md)
- [resources/worlds/village/drafts/six-regions/README.md](../resources/worlds/village/drafts/six-regions/README.md)
- [resources/worlds/village/images/landmarks/NIGHT.md](../resources/worlds/village/images/landmarks/NIGHT.md)

</details>

<details><summary>Module and service documentation (33)</summary>

- [android/README.md](../android/README.md)
- [contracts/COMPONENTS.md](../contracts/COMPONENTS.md)
- [contracts/HARNESS.md](../contracts/HARNESS.md)
- [contracts/README.md](../contracts/README.md)
- [core/README.md](../core/README.md)
- [core/agent/PORTABILITY.md](../core/agent/PORTABILITY.md)
- [core/applets/INTEGRATIONS.md](../core/applets/INTEGRATIONS.md)
- [core/applets/MY-APPLETS.md](../core/applets/MY-APPLETS.md)
- [core/applets/RUNTIME.md](../core/applets/RUNTIME.md)
- [core/artifacts/README.md](../core/artifacts/README.md)
- [core/attention/README.md](../core/attention/README.md)
- [core/diagnostics/ANALYTICS.md](../core/diagnostics/ANALYTICS.md)
- [core/games/README.md](../core/games/README.md)
- [core/items/STORAGE.md](../core/items/STORAGE.md)
- [core/ongoing/README.md](../core/ongoing/README.md)
- [core/phone/README.md](../core/phone/README.md)
- [core/widgets/README.md](../core/widgets/README.md)
- [harness/README.md](../harness/README.md)
- [harness/example/README.md](../harness/example/README.md)
- [harness/skills/README.md](../harness/skills/README.md)
- [harness/skills/worldlet/SKILL.md](../harness/skills/worldlet/SKILL.md)
- [ios/README.md](../ios/README.md)
- [platform/README.md](../platform/README.md)
- [platform/STEAM.md](../platform/STEAM.md)
- [platform/browser/INTEGRATION.md](../platform/browser/INTEGRATION.md)
- [platform/browser/README.md](../platform/browser/README.md)
- [platform/electron/COMPANION.md](../platform/electron/COMPANION.md)
- [platform/electron/DISTRIBUTION.md](../platform/electron/DISTRIBUTION.md)
- [platform/electron/README.md](../platform/electron/README.md)
- [platform/install/README.md](../platform/install/README.md)
- [platform/local-tools/README.md](../platform/local-tools/README.md)
- [platform/web-engine/README.md](../platform/web-engine/README.md)
- [scripts/DEVELOPMENT.md](../scripts/DEVELOPMENT.md)

</details>

<details><summary>Website documentation and articles (0)</summary>


</details>

<details><summary>Documentation diagrams, previews and evidence (43)</summary>

- [core/diagnostics/analytics-insights.json](../core/diagnostics/analytics-insights.json)
- [docs/architecture.html](architecture.html)
- [docs/assets/readme/applet-notes.jpg](assets/readme/applet-notes.jpg)
- [docs/assets/readme/attention.jpg](assets/readme/attention.jpg)
- [docs/assets/readme/plan.jpg](assets/readme/plan.jpg)
- [docs/assets/readme/world.jpg](assets/readme/world.jpg)
- [docs/stack-in-computer-terms.svg](stack-in-computer-terms.svg)
- [docs/stack-in-computer-terms.zh.svg](stack-in-computer-terms.zh.svg)
- [platform/distribution/index.html](../platform/distribution/index.html)
- [resources/styles/builtin/references/brand/preview.html](../resources/styles/builtin/references/brand/preview.html)
- [resources/styles/builtin/references/brand/system.html](../resources/styles/builtin/references/brand/system.html)
- [resources/styles/builtin/references/browser-focus/index.html](../resources/styles/builtin/references/browser-focus/index.html)
- [resources/styles/builtin/references/companion/evidence/active-states-webkit-dark.png](../resources/styles/builtin/references/companion/evidence/active-states-webkit-dark.png)
- [resources/styles/builtin/references/companion/evidence/active-states-webkit.png](../resources/styles/builtin/references/companion/evidence/active-states-webkit.png)
- [resources/styles/builtin/references/companion/evidence/greeting-wrist.png](../resources/styles/builtin/references/companion/evidence/greeting-wrist.png)
- [resources/styles/builtin/references/companion/evidence/lap-book-delight.png](../resources/styles/builtin/references/companion/evidence/lap-book-delight.png)
- [resources/styles/builtin/references/companion/evidence/lap-book-hud.png](../resources/styles/builtin/references/companion/evidence/lap-book-hud.png)
- [resources/styles/builtin/references/companion/evidence/mixed-props.png](../resources/styles/builtin/references/companion/evidence/mixed-props.png)
- [resources/styles/builtin/references/companion/evidence/occupied-attention.png](../resources/styles/builtin/references/companion/evidence/occupied-attention.png)
- [resources/styles/builtin/references/companion/evidence/paw-shape-after.png](../resources/styles/builtin/references/companion/evidence/paw-shape-after.png)
- [resources/styles/builtin/references/companion/evidence/paw-shape-before.png](../resources/styles/builtin/references/companion/evidence/paw-shape-before.png)
- [resources/styles/builtin/references/companion/evidence/paw-side-thickness.png](../resources/styles/builtin/references/companion/evidence/paw-side-thickness.png)
- [resources/styles/builtin/references/companion/evidence/social-phrases-webkit.png](../resources/styles/builtin/references/companion/evidence/social-phrases-webkit.png)
- [resources/styles/builtin/references/companion/evidence/working-close-depth-fix.png](../resources/styles/builtin/references/companion/evidence/working-close-depth-fix.png)
- [resources/styles/builtin/references/companion/evidence/working-close-draft.png](../resources/styles/builtin/references/companion/evidence/working-close-draft.png)
- [resources/styles/builtin/references/companion/evidence/working-handling.png](../resources/styles/builtin/references/companion/evidence/working-handling.png)
- [resources/styles/builtin/references/companion/evidence/working-runtime.png](../resources/styles/builtin/references/companion/evidence/working-runtime.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-handling.png](../resources/styles/builtin/references/companion/evidence/working-stow-handling.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-runtime-paced.png](../resources/styles/builtin/references/companion/evidence/working-stow-runtime-paced.png)
- [resources/styles/builtin/references/companion/evidence/working-stow-runtime.png](../resources/styles/builtin/references/companion/evidence/working-stow-runtime.png)
- [resources/styles/builtin/references/companion/evidence/working-stow.png](../resources/styles/builtin/references/companion/evidence/working-stow.png)
- [resources/styles/builtin/references/companion/index.html](../resources/styles/builtin/references/companion/index.html)
- [resources/styles/builtin/references/day.png](../resources/styles/builtin/references/day.png)
- [resources/styles/builtin/references/home-readers/open-focus-v1.png](../resources/styles/builtin/references/home-readers/open-focus-v1.png)
- [resources/styles/builtin/references/immersive/composition.json](../resources/styles/builtin/references/immersive/composition.json)
- [resources/styles/builtin/references/immersive/final-validation.json](../resources/styles/builtin/references/immersive/final-validation.json)
- [resources/styles/builtin/references/immersive/use-case-audit.json](../resources/styles/builtin/references/immersive/use-case-audit.json)
- [resources/styles/builtin/references/immersive/use-cases.json](../resources/styles/builtin/references/immersive/use-cases.json)
- [resources/styles/builtin/references/night.png](../resources/styles/builtin/references/night.png)
- [resources/styles/builtin/references/village-hud/components.png](../resources/styles/builtin/references/village-hud/components.png)
- [resources/styles/builtin/references/village-hud/weather.png](../resources/styles/builtin/references/village-hud/weather.png)
- [resources/styles/builtin/references/youtube-web/focus-concept.png](../resources/styles/builtin/references/youtube-web/focus-concept.png)
- [resources/styles/builtin/references/youtube-web/peek-focus-concept.png](../resources/styles/builtin/references/youtube-web/peek-focus-concept.png)

</details>

<!-- documentation-inventory:end -->
