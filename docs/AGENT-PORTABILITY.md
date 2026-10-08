# Harness independence and data ownership

Worldlet owns the user's world and companion relationship. The official build uses
Hermes; another Harness can replace execution without becoming the owner of the UI
or portable user records. This is an adapter boundary, not a license announcement.

## Division of ownership

| Worldlet | Harness | Model/service |
| --- | --- | --- |
| World, Applets, UI, durable items, companion identity and portable archives | Planning, tool loop, live sessions and backend-specific memory writers | Inference and provider-specific access |
| Schedule settings, admission rules, permissions and receipts | Execute admitted jobs and report correlated events | Quotas and usage facts |

Worldlet does not implement a competing general-purpose planner. Contracts describe
capabilities and data, not permission to access every resource. External adapters
must advertise actual support; replacing Hermes does not imply connector parity.

## One companion conversation

Fox has one foreground conversation across Applets. Current view is bounded context,
not a new session. Background tasks, setup, sample and private scopes stay isolated.
Selected coding sessions use explicit routing, cleared when the user leaves them.

## Portable records and explicit transfer

Worldlet keeps portable identity, personality, durable memory checkpoints and visible
conversation archives. Live Harness state is distinct and may use its own format.
Import/export or profile attachment is explicit, previewed and scoped; never copy
credentials or silently merge private histories. Replacing an adapter must preserve
stable world IDs, provenance and user choices.

Attached external profiles remain external. Resetting Worldlet must not erase them.
Whole-world native backups and portable companion archives are separate formats;
one cannot be advertised as arbitrary cross-platform migration.

## Failure and capabilities

Negotiate protocol version and optional services before dispatch. Missing capabilities
produce a clear unavailable result. Correlate events to the active request, reject late
results, support cancellation and never auto-replay uncertain external writes.
Local browser, speech and coding tools remain host capabilities rather than requiring
a specific Harness's private implementation.

[Portable records and adapter details](../core/agent/PORTABILITY.md) defines transfer,
archive and attachment semantics. [Wire contract](../contracts/HARNESS.md) defines the
stable interface; [architecture](UI-CORE-PLATFORM.md) defines ownership and imports.
