# Development workflow

Keep product behavior shared, changes reviewable and main usable. Routine development
must not publish installers, alter personal data or silently acquire new permissions.

## Worktrees: test independently, integrate into main

`origin/main` is the shared source of truth. Keep the primary checkout on main and
fast-forward it only when clean. Develop in named `codex/` branches in linked worktrees.
Do not merge feature branches locally into main or bypass branch protection.

Link work to an Issue. Push a proportionately checked PR, review it and squash-merge
after required checks pass; agents may complete that flow without another human review
wait. Synchronize clean primary main afterwards. Preserve unmerged work before cleanup.

Feature profiles isolate Worldlet data and credentials. They do not isolate real OS
accounts, local coding CLIs or remote services. Use fictional records/disposable accounts;
never copy personal grants to make a test pass.

## Shared-first implementation

UI owns presentation, pure Core owns product rules, Platform supplies facts and effects.
Use component public interfaces and declared capabilities. Put new retry, scheduling,
status and validation decisions in the shared owner, not in Electron host modules.
Follow the [architecture standard](UI-CORE-PLATFORM.md) for every cross-platform change.

## Verification

Match checks to risk: documentation links for docs; targeted shared fixtures for rules;
Electron host checks (`npm run test:electron`) and device runs for OS/browser lifecycle; actual accounts for provider acceptance.
Compilation, mocks and screenshots do not establish whole-product readiness. Record
what was checked and what remains unverified in the Issue/PR.

## Nightly review

Machine 03 reviews main from 01:05 to 05:00 America/Los_Angeles and files
self-contained fix Issues; machines 01 and 02 release and fix them from 03:00 to 07:00 so
the 08:00 release carries them. Model-free host work runs gates and safe repository
cleanup; the review is one Claude lane over new commits, plus a full whole-repository
review with parallel subagents every third night. Nightly workers have wall-clock limits. GitHub Actions only
creates, releases and defers Issues.
Lanes, the fix Issue template, caps and the morning digest are defined in
Nightly review. The former Claude Cloud
**Daily code review** routine (`trig_012EbXwKjvZ7uHMiBfQkSAWL`) must stay paused.

Machine roles, quiet monitoring and release ownership are defined in
machine operations. Automation must not discard
local changes or publish from the wrong host. A failed gate remains a failure.

## Documentation ownership

`docs/` contains durable high-level product, architecture and operating principles.
Public API schemas, commands, bounds and integration runbooks live beside their owning
component. Artwork prompts/provenance live with resources. Completed implementation
and release journals live in Git or Issues, not a new documentation archive.

The root [README](../README.md#documentation-index) indexes every document. Applet
package descriptions are runtime-required references, not additional architecture docs.
Update the existing inventory with `node scripts/docs-check.ts --write-index`.

[Development commands and diagnostics](../scripts/DEVELOPMENT.md) provides the runbook.
[Release policy](RELEASE-GUIDELINES.md) owns publication; development success is not release.
