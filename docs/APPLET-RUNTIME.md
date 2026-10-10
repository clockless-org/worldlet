# Applet runtime

An Applet is a user-facing capability in the world. Its device, accounts, tasks and
content share a stable identity; opening a view is not a prerequisite for its work.

## Responsibility boundaries

| Owner | Responsibility |
| --- | --- |
| Applet | Declared capabilities, source-specific reads, interpretation and commands |
| Core runtime | Scheduling policy, admission, priorities, retries and durable delivery |
| Platform | Permissions, awake clock, process/file IO and atomic persistence |
| Harness | Execute admitted jobs through the negotiated contract |
| Attention Center | Consume findings, reconcile relevance and publish items |
| Fox | Explain results and request authorized actions |

There is one claim authority. The runtime does not implement a second Agent loop.
Collection, analysis and Attention publication have independent checkpoints: a
successful read is not successful interpretation or useful Attention.

## Package contract

Machine declarations belong in versioned `runtime.json`; `applet.md` describes the
package and grants no execution rights. A manifest references implemented trusted
handlers, never arbitrary downloaded scripts. Installation, account authorization
and permission to process private content are separate decisions.

Scheduled, observation, on-demand and website modes have different capabilities.
A website-only device has no implied background reader or account API. Disabling
Attention subscription does not disable the Applet's independent work.

## Reliability

- Task identity survives runs; each attempt has its own receipt and outcome.
- Outputs commit only against current account, generation, lease and input revision.
- Failed reads preserve previous records. Partial coverage remains explicit.
- Retry transient failures within bounds; unknown external-write outcomes require
  inspection and must not trigger automatic resubmission.
- Pause, disconnect, reset and account changes invalidate obsolete writers.
- Foreground interaction remains responsive while admitted background work proceeds.
- Jobs run while the app is running and the machine is awake; no OS daemon or
  execution during sleep is implied.

## Status and presentation

Devices distinguish disconnected, ready, processing, paused and failed. Lamps are
dark (disconnected), steady white (ready), breathing white (processing) and red
(failed); paused devices retain content without implying work. Red, and the notice
over the device, mean the person must act: sign in again, allow access, or review
a run that failed. A check, read or analysis that failed for any other reason
retries by itself and leaves the lamp as it was (`core/applets/read-recovery.ts`). Unread findings have
no lamp state: they belong to the Attention Center. Reduced motion uses steady
indicators. Unknown counts and outcomes stay unknown.

Connection/loading/error messages belong to device state, not invented Attention
items. User decisions survive refresh. Diagnostics describe runs and outcomes,
not source bodies or credentials.

## Acceptance and evolution

Validate collection, interpretation, publication and recovery independently on both
hosts. Fixtures establish contract behavior, not live-account quality. Multi-account
instances and arbitrary third-party installation must not be implied by the present
provider identity or package format.

[Runtime implementation and limits](../core/applets/RUNTIME.md) owns record schemas,
collection bounds and task policies. [Harness contract](../contracts/HARNESS.md)
owns transport; [Attention design](ATTENTION-CENTER.md) owns publication.


## Token-bounded source pipeline

Mail and Calendar both declare `sync` and `analyze` tasks in `runtime.json`.
The analyze task owns `prompt: "prompts/extract.md"`; packaging validates and bundles it.

| Stage | Responsibility | Model/context |
| --- | --- | --- |
| Scripts | Normalize, detect changed revisions, exclude certain irrelevant records | No model. Spam/Trash only for complete Mail threads; cancelled/declined or exactly ended Calendar events. Promotions remain eligible. |
| Applet extraction | Preserve grounded obligations, events and useful information | S, five records per batch, fresh history, one JSON completion and at most one validation repair. |
| Attention Center | Combine related Applet findings, preserve user decisions, classify and write useful briefs | M, fresh bounded batch; related candidates and checked evidence quotes, not the whole mailbox or prior agent conversation. |

The Center keeps original evidence for validation. Changed originals invalidate old visibility and wait for S before M sees their new revision. Previously published sources are re-evaluated even when S now returns no findings. Checkpoints advance only after validated submission; unchanged observations do not restart extraction. Scheduled relevance/expiry checks still apply.

Both batch paths disable model tools and submit the validated structured result through the host. Review/update operations are authorized by existing host fences. A transport error or a failure after partial writes does not replay the write sequence within the batch. No S-to-M fallback is introduced: M is an explicit downstream job.

### Partial acceptance and bounded retry

A batch is not all-or-nothing. The Harness validates each finding and review separately; the first rejection gets one indexed repair. After that, verified findings are submitted, and only the inputs cited by rejected findings are withheld from `processedContextIds`. The host validates and saves each finding on its own. It withholds the inputs of rejected findings and still acknowledges no-finding inputs. If every finding is rejected, the Harness acknowledges only uncited inputs without another model call. Receipts are revision-exact. A related fact that changes during an M run therefore no longer cancels the run. Each finding's own dependencies must still be current, and the changed fact becomes a new pending seed. In S, a thread that changed mid-run stays pending while its unchanged siblings commit.

Retries are bounded per input. In S, a record that fails at an unchanged revision (validation or coverage, not quota, network, auth or cancellation) is retried alone after untried mail. After three failures it is parked until its source revision changes. In M, seeds still pending after a partial pass retry alone and quarantine after three isolated attempts (existing manual retry). Each M pass seeds one provider, so a Mail batch cannot hold back Calendar findings; related context still spans Applets. `scripts/source-batch-check.py`, `scripts/applet-analysis-state-check.ts`, `scripts/runtime-deliveries-check.ts` and `--world-interaction-check` cover these rules with fixtures, not live accounts.

### Why this saves tokens

- Fixed workflows avoid unnecessary planning/tool loops ([Anthropic workflow guidance](https://www.anthropic.com/engineering/building-effective-agents)).
- Fresh batch history, relevant saved items and grounded evidence excerpts reduce repeated context ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- Stable system instructions precede dynamic time/context, improving prefix-cache eligibility; a cache hit is not guaranteed ([Cloudflare prompt caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/)).
- These are immediate application batches, not the asynchronous [Cloudflare Batch API](https://developers.cloudflare.com/workers-ai/features/batch-api/); no Batch API discount is assumed.

Verification: `scripts/applet-pipeline-check.ts` exercises filtering, revision gates, no-finding acknowledgements and evidence projection; `scripts/source-batch-check.py` exercises bounded completions, skipped batches, synthesis reviews and failure handling. Fixtures do not establish real-account extraction quality or measured billing savings.

### Extraction validation versus display copy

S candidates are private staging: titles may be up to 200 characters, reasons up to 600, and a full source location does not require a card locationName. Core still validates type, dates, bounded content and authorized evidence. M alone must produce final concise card copy. A unique source match differing only in whitespace can be restored to its exact original span before evidence validation; ambiguous, translated or rewritten quotes remain invalid. Validation repair includes source/item indexes and safe guidance. Background batch agents use the cron platform to suppress auxiliary session-title model calls.

S and M receive numbered evidence segments (up to 800 characters each, preserving original text) and selects `quoteRef` within a source. The Harness resolves these to exact quotes before host validation; unknown segment/source combinations fail closed. Disjoint extracted passages retain separate segment boundaries. This avoids model transcription errors in HTML-derived mail. Only published item IDs may be reused for updates; private candidate IDs are removed from synthesis input. Event output requires an explicit supported start time. Empty optional fields are omitted before schema validation; required facts remain mandatory.
