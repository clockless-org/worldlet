# Todoist

Read active tasks through the official OAuth MCP server; no user plugin installation.

## Website presentation

Opening this Applet loads its original website in Worldlet's isolated browser surface. The Village theme supplies only the backdrop and measured page rectangle; the site's own interface handles editing, navigation and account sign-in. Existing authorized data readers remain available to Fox and Attention; opening the site does not grant them new access.

## Runtime

- Stable identity: `app-todoist`; provider: `todoist`.
- Executable configuration: [runtime.json](runtime.json).
- Mode: **on-demand**.

- Peek: shared device and connection state.
- Saved-content list: 20 active tasks per request, with cursor pagination. Titles remain the source titles.
- Saved-content detail: complete task description and returned task metadata; Web opens Todoist for editing. Fox can prepare completion of a non-recurring task without active subtasks.
- Shared/Core validates read requests; the desktop host verifies connection identity and revision around IO (`platform/electron/src/modules/sources/reviews.ts`).
- Hermes exposes only `find-tasks` and `fetch-object` in the read catalog in an isolated source worker. Todoist is not exposed as a broad chat MCP toolset.
- Completion requires the existing one-use Fox confirmation. Core rejects unavailable/recurring/completed tasks, active subtasks and changed reviews. The isolated host calls `complete-tasks` once, then reads back; only a completed record plus an exact success receipt verifies the write. Uncertain results are not replayed.
- No create/edit/delete, background publication, comments or attachment ingestion in this slice.
- Source reads require the host reader capability; the website entry is available independently.
- Fixture verification is separate from OAuth and real-account acceptance.

## Status

Fixture-tested implementation, awaiting real-account acceptance.

See [runtime](../../../core/applets/RUNTIME.md) and [integrations](../../../core/applets/INTEGRATIONS.md).
