# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public Issue, pull request or discussion for a suspected vulnerability.

Include what you found, how to reproduce it, the affected version (Settings › About shows it) and the operating system. We acknowledge reports and keep you informed while a fix is prepared.

## Scope

In scope: the desktop app (Electron host, interface, Core), the phone apps, the Harness adapters and the `worldlet` MCP server they expose to an Agent.

Out of scope: problems in a third-party Agent or Harness (OpenClaw, Hermes Agent, Claude Code, Codex, pi) that Worldlet only connects to; report those to their own projects.

## Design rules that matter for security

- Content read from email, websites and other outside sources is data, never instructions; the [turn trust rules](contracts/README.md) keep it from starting actions on its own.
- Account credentials stay in the person's own Harness or system keychain; Worldlet does not copy them into its own storage.
