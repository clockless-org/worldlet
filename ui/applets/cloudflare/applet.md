# Cloudflare

Use Cloudflare on its dashboard, and connect it as a read-only Worldlet Service so Fox and the Agents you allow can read its analytics.

## Runtime

- Stable identity: `app-cloudflare`; provider: `cloudflare`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**. Opening the Thing shows Cloudflare's dashboard. Connecting signs in with Cloudflare's own page in Settings › Connectors, reading only, and the person picks the account when there are several. Under Advanced, an API token with Account Analytics Read (and Zone Read and Zone Analytics Read for zones) and the account ID connect it instead; Worldlet checks either with one read before keeping it in this computer's vault.
- Reads: `read_service` with provider `cloudflare` and operation `read`, only when asked: `workers` (invocations, errors and CPU time per Worker) or `zones` (requests, cache and threats per zone), each over the last 24 hours. Nothing is read in the background, and nothing is changed in Cloudflare. See [Cloudflare as a Worldlet Service](../../../context/applets/INTEGRATIONS.md#cloudflare-service).

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
