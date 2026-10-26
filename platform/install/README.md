# One-line installers

`install.sh` (macOS and Linux) and `install.ps1` (Windows) install the newest release with one command, for people who run an Agent and for Agents installing Worldlet themselves through the [worldlet skill](../../harness/skills/worldlet/SKILL.md) or [agent.md](#agentmd). The website serves them at `https://worldlet.ai/install.sh` and `https://worldlet.ai/install.ps1`. On every system they install the same thing: the headless Worldlet service, the [Node host](../server/README.md) with no window, for the person's own account (no administrator password), started at login. On a Mac or Windows computer the World then opens in the browser; on Linux they print its link and QR code. The desktop app is an optional download from [worldlet.ai/download](https://worldlet.ai/download/), and it opens the same World ([the app takes over](../server/README.md#the-desktop-app-takes-over)).

```sh
curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
```

```powershell
& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent hermes
```

What they do:

1. **An app already installed stays.** On a Mac with `Worldlet.app` in `/Applications` or `~/Applications`, or a Windows computer with `%LOCALAPPDATA%\Programs\Worldlet`, they only open the app (with `--connect=<id>` when an Agent is named) and stop: the app updates itself, and a service beside it would run two Worldlets on one library. A service on a library of its own (`WORLDLET_PROFILE_ROOT`) is installed anyway.
2. **The Agent**: `--agent` / `-Agent` (`hermes`, `openclaw`, `claude-code`, `codex`, `pi`; `install.sh` also takes `claude`), or else the first of `hermes`, `openclaw`, `claude` and `codex` on PATH.
3. **The package**: they read the service feed (`/downloads/server.json`, Beta), download `worldlet-server-<label>-<target>.tar.gz` for this computer (`macos-x64`, `macos-arm64`, `linux-x64`, `linux-arm64`, `windows-x64`), check it against its SHA-256 (`<file>.sha256`, or the feed's `sha256` on Windows) and every file in it against its `SHA256SUMS`, unpack it into `~/.worldlet/<label>` (`%USERPROFILE%\.worldlet\<label>`) and point `current` at it (a junction on Windows). The build before stays until the next install, older ones go. The `worldlet` command is `~/.local/bin/worldlet` on Mac and Linux; on Windows `current\bin` joins the user's PATH.
4. **The service**, stopped first when an earlier install runs it:
   - Mac: the launch agent `~/Library/LaunchAgents/ai.worldlet.service.plist` (`launchctl bootstrap gui/<uid>`), with the installer's PATH so it finds the Agent. It starts at login and again after a crash, not after `worldlet stop`; its log is `~/.worldlet/worldlet.log`.
   - Windows: `start-worldlet.vbs` in `.worldlet` starts `node.exe` hidden, now and at every login through the `WorldletService` value of the current user's Run key.
   - Linux: the systemd user unit `worldlet.service` (with the installer's PATH), `systemctl --user enable --now` (a restart when it already ran) and `loginctl enable-linger`, which keeps it running after logout and starts it at boot; when that fails it warns and goes on. Without a systemd user session (a container, WSL without systemd) it starts the service in the background with `nohup` (log in `~/.worldlet/worldlet.log`) and says it will not start again after a restart.
5. **The Agent is connected**: `worldlet setup --agent <id>`, which for Claude Code and Codex also registers Worldlet's MCP server and skill, as `worldlet register --agent <id>` does ([the `worldlet` command](../server/README.md#the-worldlet-command)). A failure there is a warning with the command to run again.
6. **The World**: on a Mac or Windows computer they open `worldlet link --local`, the World on this computer, in the default browser, where the person finishes setup, and say that the app is an optional download. On Linux they print the browser link and its QR code (`qrencode -t ANSIUTF8` when it is installed, else `worldlet link --qr`), and an `ssh -L` command for opening the full World page, which answers only on that computer, from another one; `worldlet link --local` on the server gives that owner window for first setup and connection settings ([first setup on your own server](../server/README.md#first-setup-on-your-own-server)).

Running one again updates to the newest package, or keeps the one installed, and repeats steps 4 to 6. `WORLDLET_HOME` installs somewhere else than `~/.worldlet`, `WORLDLET_PROFILE_ROOT` gives the service another library, and `WORLDLET_SITE` reads the feed and package from another origin; `install.sh` also reads a local folder: `WORLDLET_SITE=file:///path/to/site` reads `site/downloads/server.json` and the tarball beside it (what [`npm run package:server`](../server/README.md#package) writes, with a feed beside it). `WORLDLET_NO_LOGIN_START=1` starts the service in the background without a start at login (and, on Windows, leaves the user's PATH alone), and `WORLDLET_NO_BROWSER=1` opens no browser, as the release machines' install checks run them. `node scripts/install-scripts-check.ts` checks the scripts and agent.md.

## agent.md

[agent.md](agent.md), served at `https://worldlet.ai/agent.md`, is what any Agent follows when the person tells it 「Install Worldlet: follow https://worldlet.ai/agent.md」: ask for a go-ahead, run the installer for its computer with its own name, check that Worldlet is registered in it (the `worldlet setup` and `worldlet register` commands when the installer warned), and send the person the World's link, with the QR code on Linux (`worldlet link --qr`). It asks for no secret. It says the same commands as the [Worldlet skill](../../harness/skills/worldlet/SKILL.md), and `install-scripts-check.ts` fails when either stops naming one of those commands or a command no longer exists.

## Real-device acceptance

`install-acceptance.ps1` runs the Windows one-liner exactly as people paste it on a real Windows computer (01 after a release, locally or over SSH), with the service in a temporary folder on a library of its own, no start at login and no browser, and checks the result against the public service feed: the installer's exit code, that the service runs the feed's version, Defender events since the start, and the time taken. It stops and removes that service and prints one JSON result (`-Out <file>` also saves it); exit 0 means every check passed. An installed app and its World are left as they are.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File platform/install/install-acceptance.ps1 -Out install-acceptance.json
```
