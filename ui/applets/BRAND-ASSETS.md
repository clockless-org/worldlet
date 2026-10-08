# Applet brand assets

Original marks identify third-party services; trademarks belong to their owners. Every asset is bundled locally and never fetched at runtime. Original color, ratio and built-in background are kept; logos are not redrawn with canvas paths, fonts or AI.

Files are stored byte-for-byte as published; `logo-source.ts` only embeds them as base64. The single format conversion is Codex: the installed official OpenAI Mac app's `Contents/Resources/app.icns` exported to PNG with macOS `sips -s format png`, without redrawing or recoloring. Brand graphic and status badge are separate layers. Home's Mail, Calendar, Notes and Reminders use generic function icons in the world (`_shared/core-applet-logo.ts`); their provider assets below remain for authorization copy.

Hashes and retrieval records: [`brand-assets.json`](brand-assets.json). When an asset changes, update the file, the embedded module and the record together; layout only scales proportionally and never strips a white background or recolors.

| Applet | Official page | Original file | Local asset |
| --- | --- | --- | --- |
| Gmail | [Site](https://workspace.google.com/products/gmail/) | [File](https://www.gstatic.com/images/branding/productlogos/gmail_2026/v2/web/192px.svg) | [gmail/logo.svg](gmail/logo.svg) |
| Google Calendar | [Site](https://workspace.google.com/products/calendar/) | [File](https://www.gstatic.com/images/branding/productlogos/calendar_2026/v2/web/192px.svg) | [google-calendar/logo.svg](google-calendar/logo.svg) |
| Apple Notes | [App Store](https://apps.apple.com/us/app/notes/id1110145109?uo=4) | [File](https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bc/b1/1c/bcb11c9d-ea61-089f-3b84-0f8911dd175d/notesCalistoga-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg) | [apple-notes/logo.jpg](apple-notes/logo.jpg) |
| Apple Reminders | [App Store](https://apps.apple.com/us/app/reminders/id1108187841?uo=4) | [File](https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ac/53/c8/ac53c892-22b6-b0d8-ace6-9750d777b56f/remindersCalistoga-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg) | [apple-reminders/logo.jpg](apple-reminders/logo.jpg) |
| GitHub | [Site](https://github.com/) | [File](https://github.githubassets.com/favicons/favicon.svg) | [github/logo.svg](github/logo.svg) |
| Codex | [Site](https://openai.com/codex/) | Installed official OpenAI app, `Contents/Resources/app.icns` | [codex/logo.png](codex/logo.png) |
| Claude Code | [Site](https://claude.com/product/claude-code) | [File](https://claude.ai/favicon.svg) | [claude-code/logo.svg](claude-code/logo.svg) |
| Notion | [Site](https://www.notion.com/) | [File](https://www.notion.com/front-static/logo-ios.png) | [notion/logo.png](notion/logo.png) |
| Plaid | [Site](https://plaid.com/) | [File](https://plaid.com/assets/img/favicons/apple-touch-icon.png) | [plaid/logo.png](plaid/logo.png) |
| Stripe | [Newsroom](https://stripe.com/newsroom/information) | [File](https://stripe.com/favicon.ico) | [stripe/logo.ico](stripe/logo.ico) |
| Strava | [Site](https://www.strava.com/) | [File](https://d3nn82uaxijpm6.cloudfront.net/icon-strava-chrome-192.png?v=dLlWydWlG8) | [strava/logo.png](strava/logo.png) |
| Oura Ring | [Site](https://ouraring.com/) | [File](https://ouraring.com/assets/icons/apple-touch-icon.png) | [oura/logo.png](oura/logo.png) |
| Google Maps | [Site](https://about.google/products/) | [File](https://www.gstatic.com/marketing-cms/assets/images/55/0e/c70d6751460a973c06968f0b64e0/logo-maps-2025-color-2x-web-96dp.webp) | [google-maps/logo.webp](google-maps/logo.webp) |
| Airbnb | [Site](https://www.airbnb.com/) | [File](https://a0.muscache.com/airbnb/static/icons/apple-touch-icon-180x180-bcbe0e3960cd084eb8eaf1353cf3c730.png) | [airbnb/logo.png](airbnb/logo.png) |
| X | [Site](https://about.x.com/en) | [File](https://about.x.com/content/dam/about-twitter/x/large-x-logo.png.twimg.1920.png) | [x/logo.png](x/logo.png) |
| YouTube | [Site](https://www.youtube.com/) | [File](https://www.youtube.com/s/desktop/dc4e66d7/img/favicon_144x144.png) | [youtube/logo.png](youtube/logo.png) |
| TikTok | [Site](https://www.tiktok.com/) | [File](https://www.tiktok.com/favicon.ico) | [tiktok/logo.png](tiktok/logo.png) |
| Discord | [Branding](https://discord.com/branding) | [File](https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/66e3d80db9971f10a9757c99_Symbol.svg) | [discord/logo.svg](discord/logo.svg) |
| DoorDash | [Site](https://about.doordash.com/en-us) | [File](https://about.doordash.com/favicon.ico) | [doordash/logo.ico](doordash/logo.ico) |

Hidden definitions keep their assets:

| Applet | Official page | Original file | Local asset |
| --- | --- | --- | --- |

A logo marks a service entry; it does not mean the account is connected or that the service partners with Worldlet.

Voice Memos uses the installed Apple macOS VoiceMemosApp.icns converted to PNG without redrawing; see [provenance](voice-memos/README.md).
