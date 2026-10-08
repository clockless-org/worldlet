# Local native tools

Harness-independent coding session readers/runners, subprocess transports and speech workers. The interface build bundles these into `WorldletWeb/local-tools/` through `scripts/build-local-tools.ts`, where the desktop host runs them (for example `modules/media/coding.ts` and `modules/media/speech.ts`). They do not import the Hermes adapter.

Native hosts retain consent, process control and credential filtering. Python and any optional speech/coding SDK dependencies must be available; choosing an external Harness does not grant permission to bootstrap Hermes merely for these helpers. `WORLDLET_TOOLS_PYTHON` may select an existing tool runtime.

Provider-specific source connectors remain in `harness/hermes/`.
