# World data and lifecycle

The user owns their world, durable context and companion relationship. Data storage
is independent of artwork, installed app bundles and the selected Harness.

## Data domains

| Domain | Meaning |
| --- | --- |
| Connections | Account identity, grants and source capabilities; credentials stored separately |
| Sources | Original identity, bounded snapshots, provenance and revisions |
| Applet state | Collection cursors, observations, analysis checkpoints and findings |
| Attention | Evidence-backed items, user decisions and publication state |
| Companion | Portable identity, personality, memory checkpoints and visible conversations |
| World preferences | Region names/themes, placement, appearance and user overrides |
| Execution history | Bounded task/event metadata and outcome receipts |

SQLite provides durable records and transactions; configuration and approved original
files retain their explicit formats. Schema and file paths belong to the implementation,
not the UI. Core owns decisions; Platform performs persistence and OS protection.

## Integrity and identity

IDs derive from stable source/account meaning, not display text. Preserve provenance,
revision and observation time. Commit outputs atomically with current permission and
execution fences; stale work cannot overwrite a reset or a different account.

Originals, model interpretation and visible summaries are separate records. A bounded
snapshot is not a full account mirror. Read failures preserve earlier state and may
make it uncertain; absence from a partial result cannot mean deletion or completion.

## User control

Disconnect stops future access; it is not the same as deleting saved context. Deleting
one source preserves unrelated records and shared evidence. Task completion, item
suppression, memory deletion and whole-world reset have different scopes.

Destructive changes are explicit and reviewed. Credentials stay out of Git, assets,
portable conversation archives and diagnostics. Attached external Harness profiles
retain their own lifecycle; Worldlet reset must not erase an external installation.

Backups and portable companion transfers are distinct. Document platform compatibility,
excluded secrets and restore behavior before claiming migration. Restart and app updates
must preserve stable IDs, grants where supported and user decisions.

## Tool boundary and verification

UI and Harness use domain operations through public contracts, never direct ledger
mutation. Source text cannot instruct writes. External action outcomes are recorded
separately from local state changes; cancellation is not rollback.

[Storage and tool implementation](../core/items/STORAGE.md) owns schemas, retention,
backup and commands. [Portability](AGENT-PORTABILITY.md) owns Harness replacement;
[Attention](ATTENTION-CENTER.md) owns user-facing item lifecycle. Validate transactions,
restart, failure and restoration with fictional records before real-account acceptance.
