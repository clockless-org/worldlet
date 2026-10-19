# PostHog

Use PostHog on its website, and connect it as a Worldlet Service so Fox and the Agents you allow can read it.

## Runtime

- Stable identity: `app-posthog`; provider: `posthog`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**. Opening the Thing shows PostHog's website. Connecting takes a personal API key, the PostHog address (US Cloud, EU Cloud or a self-hosted one) and a project ID; Worldlet checks them with one read before keeping the key in this computer's vault.
- Reads: `read_service` with provider `posthog`, only when asked: `query` (one read-only HogQL SELECT, at most 200 rows) and `read` (insights, dashboards, feature flags or annotations). Nothing is read in the background, and nothing is changed in PostHog. See [PostHog as a Worldlet Service](../../../context/applets/INTEGRATIONS.md#posthog-service).

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
