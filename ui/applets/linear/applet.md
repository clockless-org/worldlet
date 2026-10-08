# Linear

Read your Linear issues through the official Linear MCP server; no user plugin installation.

## Runtime

- Stable identity: `app-linear`; provider: `linear`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

- Peek: shared device and connection state.
- Open: your issues, newest first, 20 per request with cursor pagination when the server offers one. Titles remain the source titles; the card line shows status, priority and due date.
- Focus: the complete issue description and returned metadata (status, priority, project, team, assignee, labels, dates); Web opens Linear for creating and editing.
- Shared/Core validates read requests (`core/applets/curated-source.ts`); the request goes to the isolated Hermes source worker (`harness/hermes/linear_mcp.py`).
- The reader calls only `list_issues` and `get_issue`. It fits its request to the arguments the server advertises (assignee `me`, limit, order, cursor) and accepts a Linear OAuth connection or an API key brought over from another Agent.
- No create, edit, comment or background publication in this slice.
- Fixture verification is separate from OAuth and real-account acceptance.

## Status

Fixture-tested implementation, awaiting real-account acceptance.

See [runtime](../../../core/applets/RUNTIME.md) and [integrations](../../../core/applets/INTEGRATIONS.md).
