# GitHub

Follow code, reviews and releases in one place.

## Website presentation

Opening this Applet loads its original website in Worldlet's isolated browser surface. The Village theme supplies only the backdrop and measured page rectangle; the site's own interface handles editing, navigation and account sign-in. Existing authorized data readers remain available to Fox and Attention; opening the site does not grant them new access.

## Runtime

- Stable identity: `app-github`; provider: `github`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**: every 15 minutes, while Worldlet is open with private-context consent, the reviews requested of the person and the Issues assigned to them (with their own open pull requests) are read for Attention (context/applets/INTEGRATIONS.md#github-service).

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
