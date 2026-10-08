# Product analytics and AI observability

Measure whether people can enter their world, connect useful sources, talk to Fox
and act on reliable findings. One main dashboard should answer those questions
without confusing installation, identity, usage and revenue.

## Measurement model

| Area | Questions |
| --- | --- |
| Acquisition and onboarding | Who was first observed, attempted authorization and completed setup? |
| Activation and retention | Who entered, chatted or handled an item, and returned later? |
| Reliability | Which platform, version and stage failed or stalled? |
| Model usage | Which task/tier consumed tokens, latency and estimated cost? |
| External actions | Was an action attempted, verified, failed or left uncertain? |

Use stable anonymous installation identity before login and the account-derived
person identity after login. Updates preserve installation identity. First observed
is not proven first installation. Count distinct users across the whole reporting
window; never add daily unique counts to estimate monthly users.

## Data boundaries

Production reporting respects the configured privacy controls. Development, Sample
and explicit verification traffic must not inflate product metrics. Reporting is
best-effort and must not block startup, conversation or shutdown.

User identity may include the authorized user's email and available display name;
connected third-party content, prompts, replies, page bodies, browsing history,
credentials and recordings are excluded. No session replay or broad autocapture.
Diagnostics and voluntarily submitted support feedback remain separate flows.

## AI observability

Correlate model events with the proper person, installation, task and model tier.
Record numeric usage, timing, errors and cache accounting without collecting private
text. Distinguish estimates from provider-billed cost and missing usage from zero.
Trace stages can overlap; do not sum nested timings as independent costs.

## Interpretation and acceptance

Drop-off is missing a next event within a stated window, not proof someone quit
forever. Offline use, opt-outs, older builds and deployment lag create gaps. A
successful tool invocation is not evidence a payment or booking succeeded.

[Event schema, dashboard definitions and verification](../core/diagnostics/ANALYTICS.md)
own the concrete tracking plan. New production event types appear only after real
instrumented activity; never fabricate traffic to populate a dashboard.
