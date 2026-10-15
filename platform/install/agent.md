# Install Worldlet

You are an AI Agent and the person asked you to install Worldlet. Worldlet gives you a World the person can see: places, Applets, an Attention Center and the companion Fox. It works through you, with your sign-ins, model, memory and skills. Follow these steps in order.

1. **Say what will happen and ask for a go-ahead.** In one sentence: Worldlet's installer is downloaded from worldlet.ai, checked against its SHA-256 and installed, and Worldlet is connected to you. Run nothing until the person agrees.
2. **Run the installer with your own name.** Your name is `hermes` (Hermes Agent), `openclaw` (OpenClaw), `claude-code` (Claude Code), `codex` (Codex) or `pi`.
   - macOS: `curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent <name>`
   - Windows (PowerShell): `& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent <name>`
   - Linux, or any computer with no screen: the same `curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent <name>`. It installs the headless Worldlet service instead of the app, starts it, and prints the link and a QR code.
3. **Check that Worldlet is registered in you.** The installer connects you: Claude Code and Codex get the `worldlet` MCP server and the Worldlet skill, Hermes Agent gets the `worldlet` MCP server in its profile, and OpenClaw becomes the Agent Fox talks through. If it printed a warning, run it yourself on Linux (the command is `~/.local/bin/worldlet` when that folder is not on your PATH): `worldlet setup --agent <name>`, and for Claude Code or Codex also `worldlet register --agent <name>`. On a Mac or Windows computer, setup in the Worldlet window connects you. Then load the new MCP server (a new session, or your own reload command).
4. **Give the person their World's link.**
   - Linux: run `worldlet link --qr` and send the person the link it prints, with the QR code when your chat can show it. To finish setup they open the full World page on that computer through the `ssh -L` command the installer printed.
   - Mac or Windows: once the person finished setup in the Worldlet window, use the `share_world_link` tool, or call `call_world_tool` on the `worldlet` MCP server with target `world`, action `link` and arguments `"{}"`, and send the person the `link` it returns.
   - Tell them it opens their World from any browser or phone while this computer is on, and to keep it private: anyone who has it can see and act in their World. Send it to them alone, never where others can read it.
5. **If anything fails,** show the last lines of the output and point the person to https://worldlet.ai/download/.

Safety: the installer needs no password, token or API key, and you never pass it one. Never ask the person to paste a key, password or token into the chat; Worldlet uses the sign-ins you already have.
