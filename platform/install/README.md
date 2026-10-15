# One-line installers

`install.sh` (macOS and Linux) and `install.ps1` (Windows) install the newest release with one command, for people who run an Agent and for Agents installing Worldlet themselves through the [worldlet skill](../../harness/skills/worldlet/SKILL.md) or [agent.md](#agentmd). The website serves them at `https://worldlet.ai/install.sh` and `https://worldlet.ai/install.ps1`. On Linux, or any computer with no screen, `install.sh` installs the [headless service](#linux) instead of the app.

```sh
curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
```

```powershell
& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent hermes
```

What they do on a Mac or Windows computer:

1. Read the public update feed (`/downloads/appcast.xml` on Mac, `/downloads/windows-preview.json` on Windows), the same feeds installed apps update from.
2. Download that installer and check its SHA-256 (`<file>.sha256` on Mac, the manifest's `sha256` on Windows). On Mac they also verify the app's code signature.
3. Install it: Mac copies `Worldlet.app` into `/Applications` (or `~/Applications` when that is not writable); Windows runs the per-user installer silently (`/S`, `%LOCALAPPDATA%\Programs\Worldlet`). A running Worldlet is quit first.
4. Open Worldlet. With `--agent` / `-Agent` (`openclaw`, `hermes`, `pi`, `claude-code`, `codex`) the app starts with `--connect=<id>`, so first-run setup connects that Agent without asking which one.

`WORLDLET_SITE` points them at another origin for testing, and on Mac `WORLDLET_INSTALL_DIR` installs into another folder. The release machines use both in Beta: each night they run the one-line installer against a loopback copy of the site that offers that night's candidate build, into a temporary folder on a set-aside library on Mac and a separate profile on Windows. `node scripts/install-scripts-check.ts` checks them, the Linux steps and agent.md included.

## Linux

On Linux `install.sh` installs the headless Worldlet service, the [Node host](../node/README.md) with no window, for the person's own account (no administrator password):

```sh
curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent hermes
```

1. The Agent: `--agent` (`hermes`, `openclaw`, `claude-code` or `claude`, `codex`, `pi`), or else the first of `hermes`, `openclaw`, `claude` and `codex` on PATH.
2. It reads the Linux feed (`/downloads/linux.json`, Beta), downloads `worldlet-server-<label>-linux-<x64|arm64>.tar.gz`, checks it against `<file>.sha256` and every file in it against its `SHA256SUMS`, unpacks it into `~/.worldlet/<label>` and points `~/.worldlet/current` at it. The build before stays until the next install, older ones go. `~/.local/bin/worldlet` links to the package's `worldlet` command.
3. It writes the systemd user unit `worldlet.service` (with the installer's PATH, so the service finds the Agent), runs `systemctl --user enable --now` (a restart when it already ran) and `loginctl enable-linger`, which keeps it running after logout and starts it at boot; when that fails it warns and goes on. Without a systemd user session (a container, WSL without systemd) it starts the service in the background with `nohup` (log in `~/.worldlet/worldlet.log`) and says it will not start again after a restart.
4. It runs `worldlet setup --agent <id>`, which for Claude Code and Codex also registers Worldlet's MCP server and skill, as `worldlet register --agent <id>` does ([the `worldlet` command](../node/README.md#the-worldlet-command)). A failure there is a warning with the command to run again.
5. It prints the browser link and its QR code (`qrencode -t ANSIUTF8` when it is installed, else `worldlet link --qr`), and an `ssh -L` command for opening the full World page, which answers only on that computer, from another one. Use `worldlet link --local` on the server to get that owner window for first setup and connection settings; the ordinary paired link does not allow managing connections or Agent grants. See [first setup on your own server](../node/README.md#first-setup-on-your-own-server).

Running it again updates to the newest package, or keeps the one installed, and repeats steps 3 to 5. `WORLDLET_HOME` installs somewhere else than `~/.worldlet`, and `WORLDLET_SITE` reads the feed and package from another origin, a local folder included: `WORLDLET_SITE=file:///path/to/site` reads `site/downloads/linux.json` and the tarball beside it (what [`npm run package:linux`](../node/README.md#package) writes, with its feed). `WORLDLET_NO_SYSTEMD=1` takes the background path even where systemd runs.

## agent.md

[agent.md](agent.md), served at `https://worldlet.ai/agent.md`, is what any Agent follows when the person tells it 「Install Worldlet: follow https://worldlet.ai/agent.md」: ask for a go-ahead, run the installer for its computer with its own name, check that Worldlet is registered in it (the `worldlet setup` and `worldlet register` commands when the installer warned), and send the person the World's link, with the QR code on Linux (`worldlet link --qr`). It asks for no secret. It says the same commands as the [Worldlet skill](../../harness/skills/worldlet/SKILL.md), and `install-scripts-check.ts` fails when either stops naming one of those commands or a command no longer exists.

## Real-device acceptance

`install-acceptance.ps1` runs the Windows one-liner exactly as people paste it on a real Windows computer (01 after a release, locally or over SSH) and checks the result against the public manifest: installer exit code, the installed `Worldlet.exe` Build, Defender events since the start, and the time taken. It stops the copy the installer opened and prints one JSON result (`-Out <file>` also saves it); exit 0 means every check passed. It replaces the installed app with the published Build. The window and SmartScreen are not covered: an SSH session has no desktop, and an `irm` download carries no Mark-of-the-Web.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File platform/install/install-acceptance.ps1 -Out install-acceptance.json
```
