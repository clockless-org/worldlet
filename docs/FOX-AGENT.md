# Fox: conversation and assistance

Fox is the user's companion and primary command surface. The selected Harness owns
model inference, planning, tool execution and live sessions. Worldlet owns current
context, permissions, portable records and how work is presented.

## Conversation contract

- Keep one foreground conversation across Applets; view changes supply bounded context.
- Keep setup, Sample, private processing and background jobs in separate scopes.
- Stream replies promptly; support continued input, steering and cancellation.
- Preserve drafts and user-dismissed state. Late replies cannot reopen a dismissed bubble.
- Do not greet on every Applet entry or collect the entire world for a simple greeting.
- Unknown, failed or interrupted work must be described honestly.

## Applet tasks

Talking with Fox never waits for an Applet (owner decision 2026-10-03). Background checks and
analysis already run in lanes of their own. Work that takes several steps in one Applet (searching a
website, comparing, filling a form, preparing an order) goes to that Applet as a task:

- Fox calls `applets/delegate` (`start_applet_task`) with the Applet and the whole task. Only the
  person's own words in that turn can start one, and the task's tools run under that request; page,
  mail or note text cannot start one, and a task cannot start another. A task started after the
  turn read untrusted content (mail, a web page, a source) still starts, so "sign me up" on the
  page in front of the person works (owner decision 2026-10-08), but it inherits that turn's
  untrusted state (`turnTrustInherit`), as a Moment Applet or game maker task does: it never
  starts trusted, its guarded writes are refused, and its navigation and page clicks get the same
  checks as the turn that started it. The one
  task Worldlet starts by itself is a [battle review](../core/games/README.md#battle-review) once the
  person stops playing; with no person's words behind it, it starts untrusted (`reviewGames`).
- The host (`platform/electron/src/modules/fox/index.ts`) runs it as its own chat in the Agent's task
  lane (Hermes `#tasks` worker, `worldlet.task.lock`), beside the conversation: one task per Applet,
  at most three at once, none in the practice world. The task lane is not counted as the
  conversation, so it neither makes the conversation wait nor holds back background checks.
- The page runs the task's tools like a turn's (`platform/bridge/agent-client.ts`). The History page's
  newest line says "YouTube is working on a task…", and the small screen over a page's Applet says
  the step it is on; a page Fox drives keeps Fox's control until the
  task ends, also after the conversation's turn ends.
- When it ends, the world history records `applet.task`, the result joins Fox's conversation, the
  device shows a green check, and Fox says the result once it is not answering something else
  (`ui/companion/applet-task-results.ts`). Agents without a task lane (external and local
  Harnesses) refuse the hand-off and Fox does the work in the turn.
- Usage analytics count each task's start and outcome (`applet_task_*`: the Applet's key, a duration
  bucket and a failure's error code, never the task or its result; [events](../core/diagnostics/ANALYTICS.md)).

## Models and configuration

Official builds prepare included Hermes model access. Optional provider selection,
API keys and supported account login reuse Hermes's provider catalog and auth flows;
Worldlet does not invent another provider registry. A saved key is not a successful
first reply. Provider errors need bounded retry and a clear reconfiguration path.

No Apple/local-model fallback is offered. Private processing consent remains distinct
from account connection and model access. Credentials never enter ordinary chat,
visible history or diagnostics. Local coding subscriptions may power their own
Applet sessions without being usable as Fox model providers.

## Tools and agency

Only declared capabilities cross the World gateway. Sources, website text and model
output are untrusted data, not new authority. Sending, booking, paying and destructive
changes follow their actual approval rules. Unknown external outcomes require
inspection, not replay. A task switch must clear obsolete session/action routing.

## Speech and presence

Speech is optional and must not block typing or startup. Preparation happens in the
background; transcripts submit only for the current non-cancelled recording. Audio
capture and device permissions remain OS facts reported by the host. Platform recognition capabilities
and interim-caption support may differ; do not claim parity without device evidence.

Animation follows observed task state and otherwise stays quiet. Reduced motion and
hidden-window suspension apply. Current animation drafts are not final art acceptance.
The desktop Companion reuses the existing world/conversation; no second Agent runs.

## Responsiveness and recovery

Keep model context bounded and fetch originals on demand. Separate foreground turns
from independent background lanes. Measure request preparation, first token, paint
opportunity and completion without conflating clocks or nested stages. Cancellation,
worker restart and expired credentials must preserve user records and reject stale events.

[Conversation, model setup and speech details](../ui/companion/CONVERSATION.md),
[animation](../ui/companion/ANIMATION.md), [desktop Companion lifecycle](../platform/electron/COMPANION.md)
and [Hermes implementation](../harness/hermes/README.md) own execution specifics.
