# Provider artwork

`google.png` is the Google G icon downloaded from Google's [Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines), asset URL https://developers.google.com/static/identity/images/g-logo.png. It identifies the Google connection pin in `notion-world.ts`; Google retains its trademark rights. Do not recolor or distort the artwork.

`github.png` is the GitHub mark from https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png, retained for the GitHub connection. GitHub retains its trademark rights. Other source badges use text labels.

Setup's local Agent list uses each project's own mark: `hermes.png` is Hermes Agent's site icon (https://hermes-agent.nousresearch.com/icon.png, Nous Research), `openclaw.svg` is OpenClaw's favicon (https://openclaw.ai/favicon.svg) and `pi.svg` is pi's favicon (https://pi.dev/favicon.svg, with its dark-mode style removed so it stays dark on the light setup paper). Claude Code, Codex and ChatGPT reuse their Applet logos. Each project retains its trademark rights.

Applet logos are not read from this folder. Each Applet embeds its original publisher asset as a data URL in `ui/applets/<id>/logo-source.js` (provenance and checksums in `ui/applets/brand-assets.json`) so WKWebView file-based Canvas textures remain origin-clean without a network image request; the GitHub Applet uses `ui/applets/github/logo-source.ts`.
