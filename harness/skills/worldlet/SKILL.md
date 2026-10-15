---
name: worldlet
description: "Install Worldlet, a desktop World for this Agent"
---

# Install Worldlet

Use this when the person asks to install, set up or try Worldlet (a desktop app that gives this Agent a visual World: places, Applets, an Attention Center and the companion Fox). Worldlet runs on top of this Agent: it talks through it and uses its sign-ins, model, memory, connections and skills.

1. Check the computer. Worldlet runs on macOS 14 or later (Apple silicon or Intel) and Windows 10 or later (x64). On Linux, or on a server with no screen, tell the person Worldlet needs a desktop Mac or Windows computer and stop.
2. Tell the person in one sentence what will happen: Worldlet's signed installer is downloaded from worldlet.ai, installed, and opened already connected to this Agent. Ask them to confirm.
3. Run the installer for this computer, naming this Agent (`openclaw` when you are OpenClaw, `hermes` when you are Hermes Agent):
   - macOS: `curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw`
   - Windows (PowerShell): `& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent openclaw`
4. When it finishes, Worldlet opens with this Agent already chosen. Tell the person to finish the short setup in the Worldlet window. If the command fails, show its last lines and point them to https://worldlet.ai/download/.
5. Once setup is done, give the person a window to their World they can open any time. Through Worldlet's `worldlet` MCP server, call `call_world_tool` with target `world`, action `link` and arguments `"{}"`. Send the person the `link` it returns, to them alone, and say it opens their World from any browser while this computer is on. Anyone who has the link can see and act in their World, so never post it where others can read it. From a Hermes channel (Telegram, say) the call works directly; only while Fox is working in Worldlet does the person get an Allow once card there first. If the call is refused, ask them to ask Fox in Worldlet for the browser link, or to use **Copy link** on the Mobile page.

Never run the installer without the person's go-ahead, and never pass it any password, token or API key.
