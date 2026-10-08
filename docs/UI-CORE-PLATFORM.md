# Five-layer architecture

Worldlet primarily owns the upper three layers. Keep product rules shared and the
Platform host thin; the Harness and model service are replaceable through explicit contracts.

| Layer | Repository owner | Responsibility |
| --- | --- | --- |
| UI | `ui/` | Shared Web presentation, navigation, Fox and Applet interactions |
| Core | `core/` | Pure product rules, records, scheduling decisions and validation |
| Platform | `platform/` | Electron desktop shell, permissions, persistence, processes and browser IO |
| Harness | `harness/` | Agent planning, tool loop and admitted job execution |
| Models/services | `models/` and provider APIs | Inference access, quotas and usage |

`contracts/` supplies interfaces across layers; it is not a sixth runtime layer or
an extra execution hop. Resources contain assets and declarations, not product logic.
See the [diagram](architecture.html).

## Dependency rules

Core imports only Core and Contracts; Contracts depends only on itself. UI consumes
public Core interfaces and the Host bridge. It cannot reach Platform implementations or
Harness internals. A component exports its supported `index.ts` surface; helpers are
private. Platform code executes shared decisions rather than copying them.

Thin means few independent product decisions, not flat folders or a line-count quota.
OS permission enforcement, transactional persistence and process lifetime remain in the Platform host.
Worldlet owns schedule settings and claim authority; Harness executes admitted jobs.

## Chromium and trust boundaries

One [Electron host](../platform/electron/README.md) serves Mac, Windows and Linux; it
replaced the Swift/CEF and C#/WebView2 hosts (#996). The shared World UI is a separate
Chromium view from external website/media views. Only the trusted packaged World
(`worldlet://app/index.html`) receives the Host bridge, through a `contextBridge`
preload; the main process re-checks the sending frame. Website scripts never receive
host privileges and run in their own session partition.

CDP controls a selected target; it is not a renderer, authorization bypass or general
component API. Agent-operated World navigation uses versioned semantic actions through
the same handlers as user interaction. Releasing a website destroys its page/media; leaving one keeps
at most two recent pages hidden, media paused, under the shared [resume rule](../platform/browser/INTEGRATION.md#resuming-a-website-applet),
unless the person keeps one playing as the World's [picture-in-picture](../platform/browser/INTEGRATION.md#picture-in-picture) window.

<a id="repository-layers"></a>
## Components and public interfaces

The [component catalog](../contracts/COMPONENTS.md) maps directories, exported APIs,
runtime invariants and Platform persistence operations. The [Harness wire contract](../contracts/HARNESS.md)
defines negotiation, capabilities, correlated events and cancellation. Unsupported
capabilities fail explicitly; no silent Platform or Harness-specific alternate flow.

<a id="architecture-audit"></a>
## Audit checklist

This is the single audit checklist; other documents link here.

- [ ] **Ownership:** identify one owner for each changed product rule; distinguish UI behavior, pure Core decisions, Platform effects and Harness execution.
- [ ] **Shared first:** check the Electron host modules for duplicate transitions, priorities, retry/timeout/cache policy, validation, prompts, status wording and privacy rules.
- [ ] **Thin adapters:** each retained Platform decision has an OS/API/security reason. Shared code decides policy; the host still enforces actual permissions and validates untrusted inputs.
- [ ] **Dependency direction:** Core imports only Core/Contracts; Contracts imports only Contracts. UI uses the bridge, not Platform implementations or Harness internals.
- [ ] **Capabilities:** unsupported functionality follows declared host capabilities, not copied product flows or scattered platform-name checks.
- [ ] **State and persistence:** Platform storage applies shared state transitions without losing stable IDs, account ownership or user decisions.
- [ ] **Execution:** compare busy state, queueing, cancellation, deadlines, foreground priority and background recovery. OS-specific process mechanics may differ; product outcomes should not.
- [ ] **Evidence:** trace the host path to the shared implementation. Run focused Core fixtures and the Electron module checks (`npm run test:electron`) for changed rules; list device-only verification separately.
- [ ] **Cleanup:** remove superseded Platform policy and tests that merely preserve its old implementation. Do not retain a silent duplicate as a fallback.
- [ ] **Result:** mark each area pass/partial/fail, cite files, rank remaining work, and distinguish code validation from installed-app acceptance.

Import checks do not prove behavior or performance on a device. The
[parity ratchet](../contracts/README.md#parity-vectors) holds the Core operations the
host must keep invoking (the union both native hosts used before #996). Focused commands live in
[the component catalog](../contracts/COMPONENTS.md#architecture-audit). New changes require
proportional checks and do not inherit blanket real-account or clean-machine acceptance.

## Enforced merge gate

`npm run check:arch` resolves TypeScript imports (including baseUrl aliases,
re-exports, type imports and dynamic imports), checks layer dependencies and public
Core/UI component entry points, and rejects computed imports/CommonJS bypasses.
The policy lives in `scripts/architecture-boundaries.ts`; legacy edges are exact
file pairs with reasons, and unused exceptions fail the check. New components follow
the same rules without registration. The Electron host (`platform/electron`) is in this graph; Python helper internals
are not, and their own checks remain in the gate.

The **Architecture** GitHub check runs this gate and shared type checking on every PR.
It exercises Host request validation and Harness version/capability/correlation and
terminal-state rules using fixtures, without app builds, model calls or accounts.
Main requires this check before merging. Contract changes must update the shared
schema, runtime validator and invalid-input/compatibility fixtures together; breaking
wire changes require explicit version negotiation. Passing this gate does not prove
that no product rule is duplicated in the Electron host: review that with the audit above.

Task/run/event shapes also live in [Contracts](../contracts/README.md#execution-journal).
Their validators and privacy projections run in Core; both Platform adapters persist
results into the existing local journal. Harness output never acquires database or
arbitrary event-write authority.
