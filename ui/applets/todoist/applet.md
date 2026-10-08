# Todoist

Read active tasks through the official OAuth MCP server; no user plugin installation.

## Runtime

- Stable identity: `app-todoist`; provider: `todoist`.
- Executable configuration: [runtime.json](runtime.json).
- Mode: **on-demand**.

- Peek: shared device and connection state.
- Open: 20 active tasks per request, with cursor pagination. Titles remain the source titles.
- Focus: complete task description and returned task metadata; Web opens Todoist for editing. Fox can prepare completion of a non-recurring task without active subtasks.
- Shared/Core validates read requests; the desktop host verifies connection identity and revision around IO (`platform/electron/src/modules/sources/reviews.ts`).
- Hermes exposes only `find-tasks` and `fetch-object` in the read catalog in an isolated source worker. Todoist is not exposed as a broad chat MCP toolset.
- Completion requires the existing one-use Fox confirmation. Core rejects unavailable/recurring/completed tasks, active subtasks and changed reviews. The isolated host calls `complete-tasks` once, then reads back; only a completed record plus an exact success receipt verifies the write. Uncertain results are not replayed.
- No create/edit/delete, background publication, comments or attachment ingestion in this slice.
- Mac implementation; other hosts do not advertise `curatedSourceRead` yet.
- Fixture verification is separate from OAuth and real-account acceptance.

## Status

Fixture-tested implementation, awaiting real-account acceptance.

See [runtime](../../../core/applets/RUNTIME.md) and [integrations](../../../core/applets/INTEGRATIONS.md).
