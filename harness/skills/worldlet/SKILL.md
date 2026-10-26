---
name: worldlet
description: "Install Worldlet, a World for this Agent, on any computer"
---

# Install Worldlet

Use this when the person asks to install, set up or try Worldlet (a background service, with an optional desktop app, that gives this Agent a visual World: places, Applets, an Attention Center and the companion Fox). Worldlet runs on top of this Agent: it talks through it and uses its sign-ins, model, memory, connections and skills.

1. Check the computer. Worldlet runs on macOS 14 or later (Apple silicon or Intel), Windows 10 or later (x64) and Linux (x64 or arm64). The installer sets up the headless Worldlet service for the person's own account, started at login: no window, the World opens in a browser. A Mac or Windows computer that already has the Worldlet app keeps it and the installer only opens it.
2. Tell the person in one sentence what will happen: Worldlet's installer is downloaded from worldlet.ai, checked against its SHA-256, installed and connected to this Agent. Ask them to confirm.
3. Run the installer for this computer, naming this Agent (`openclaw` when you are OpenClaw, `hermes` when you are Hermes Agent, `claude-code` for Claude Code, `codex` for Codex, `pi` for pi):
   - macOS and Linux: `curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent <name>`
   - Windows (PowerShell): `& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent <name>`
4. When it finishes, the service is running and registered in this Agent. On a Mac or Windows computer the World has opened in the browser (or the app, when it was installed): tell the person to finish the short setup there; `worldlet link --local` prints that link again. If it printed a warning, run `worldlet setup --agent <name>`, and for Claude Code or Codex also `worldlet register --agent <name>` (the command is `~/.local/bin/worldlet` when that folder is not on PATH; on Windows open a new terminal for `worldlet`). If the command fails, show its last lines and point them to https://worldlet.ai/download/.
5. Give the person a window to their World they can open any time, to them alone. On Linux run `worldlet link --qr` and send the link it prints, with the QR code when the chat can show it; to finish setup they open the full World page on that computer through the `ssh -L` command the installer printed. On a Mac or Windows computer, once setup is done, run `worldlet link --qr`, or use the `share_world_link` tool, or through Worldlet's `worldlet` MCP server call `call_world_tool` with target `world`, action `link` and arguments `"{}"`, and send the `link` it returns. Say it opens their World from any browser while this computer is on. Anyone who has the link can see and act in their World, so never post it where others can read it. From a Hermes channel (Telegram, say) the call works directly; only while Fox is working in Worldlet does the person get an Allow once card there first. If the call is refused, ask them to ask Fox in Worldlet for the browser link, or to use **Copy link** in Worldlet's Settings › Phone.

Never run the installer without the person's go-ahead, never pass it any password, token or API key, and never ask the person to paste one into the chat. The same steps are published for any Agent at https://worldlet.ai/agent.md.
