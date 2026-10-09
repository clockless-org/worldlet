# Local native tools

Harness-independent coding session readers/runners, subprocess transports and speech workers. The interface build bundles these into `WorldletWeb/local-tools/` through `scripts/build-local-tools.ts`, where the desktop host runs them (for example `modules/media/coding.ts` and `modules/media/speech.ts`). They do not import the Hermes adapter.

Native hosts retain consent, process control and credential filtering. They run on Worldlet's own tools Python (`platform/electron/src/modules/media/tools-python.ts`), set up on first use with the bundled uv: a pinned CPython, a virtual environment with pip (speech installs its own packages with it) and the hash-pinned `requirements.txt` here. No helper uses an Agent's Python. `WORLDLET_TOOLS_PYTHON` may select an existing tool runtime instead.

Provider-specific source connectors remain in `harness/hermes/`.
