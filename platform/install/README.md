# One-line installers

`install.sh` (macOS) and `install.ps1` (Windows) install the newest signed release with one command, for people who run an Agent and for Agents installing Worldlet themselves through the [worldlet skill](../../harness/skills/worldlet/SKILL.md). The website serves them at `https://worldlet.ai/install.sh` and `https://worldlet.ai/install.ps1`.

```sh
curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
```

```powershell
& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent hermes
```

What they do:

1. Read the public update feed (`/downloads/appcast.xml` on Mac, `/downloads/windows-preview.json` on Windows), the same feeds installed apps update from.
2. Download that installer and check its SHA-256 (`<file>.sha256` on Mac, the manifest's `sha256` on Windows). On Mac they also verify the app's code signature.
3. Install it: Mac copies `Worldlet.app` into `/Applications` (or `~/Applications` when that is not writable); Windows runs the per-user installer silently (`/S`, `%LOCALAPPDATA%\Programs\Worldlet`). A running Worldlet is quit first.
4. Open Worldlet. With `--agent` / `-Agent` (`openclaw`, `hermes`, `pi`, `claude-code`, `codex`) the app starts with `--connect=<id>`, so first-run setup connects that Agent without asking which one.

`WORLDLET_SITE` points them at another origin for testing, and on Mac `WORLDLET_INSTALL_DIR` installs into another folder. The release machines use both in Beta: each night they run the one-line installer against a loopback copy of the site that offers that night's candidate build, into a temporary folder on a set-aside library on Mac and a separate profile on Windows. Linux is not supported yet; the scripts say so and stop. `node scripts/install-scripts-check.ts` checks them.

## Real-device acceptance

`install-acceptance.ps1` runs the Windows one-liner exactly as people paste it on a real Windows computer (01 after a release, locally or over SSH) and checks the result against the public manifest: installer exit code, the installed `Worldlet.exe` Build, Defender events since the start, and the time taken. It stops the copy the installer opened and prints one JSON result (`-Out <file>` also saves it); exit 0 means every check passed. It replaces the installed app with the published Build. The window and SmartScreen are not covered: an SSH session has no desktop, and an `irm` download carries no Mark-of-the-Web.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File platform/install/install-acceptance.ps1 -Out install-acceptance.json
```
