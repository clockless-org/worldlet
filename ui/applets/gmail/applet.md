# Mail

Bring your messages into the things you are working on.

## Runtime

- Stable identity: `app-gmail`; provider: `gmail`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.
- Gmail API over OAuth. Initial discovery covers the latest 1,000 messages, reading thread context in bounded pages; exclude spam/trash. Later passes overlap the last successful scan by one day. S analysis proposes source-grounded candidates; M center synthesis alone publishes attention.

- Collection and analysis batch sizes are declared independently in `runtime.json`. Analysis consumes at most five messages per pass so a growing mailbox backlog does not delay each publication behind a twenty-message model response. At 100 pending source records, new collection waits for analysis to catch up; the active page may finish. Failed backlog inspection defers collection rather than treating it as empty.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

### Bounded source batches

The source-analysis Harness receives one authorized batch, calls S without tools or conversation history, validates one JSON result, and submits it through the existing native evidence/coverage fence. One invalid result may receive one fresh-context repair; transport/commit exceptions are never replayed within that run. Related saved candidates are included; unrelated inbox items are excluded. Every source ID must be acknowledged, including batches with no findings. Failed batches remain pending under the normal scheduler retry policy. S never automatically upgrades to M. The explicit M Attention Center still performs cross-Applet synthesis; a source batch cannot publish visible Attention directly.

This is immediate application-level batching, not Cloudflare's deferred asynchronous Batch API. Each small batch can register findings promptly without waiting for the entire 1,000-message discovery. Oversized source records and repeated quality failures remain visible failures, not silent truncation or a model upgrade.

Source extraction instructions live in `prompts/extract.md`. Deterministic preprocessing skips only complete threads whose messages are all Spam/Trash; Promotions alone never excludes a thread. Each fresh S batch acknowledges inspected IDs, including records with no findings.
