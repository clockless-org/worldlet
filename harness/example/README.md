# Independent Agent example

This is a small deterministic protocol example, **not a language model**. It uses Python's standard library, streams its response and opens the real Browser Applet when asked `open browser`. Replace `respond()` with your own framework integration. Do not give the adapter authority to grant Worldlet permissions.

## Run in a separate development checkout

Create an absolute-path configuration outside the repository:

```json
{
  "protocolVersion": 1,
  "id": "example",
  "executable": "/usr/bin/python3",
  "arguments": ["/absolute/path/to/worldlet/adapters/example/agent.py"]
}
```

```sh
WORLDLET_AGENT_CONFIG=/absolute/path/to/agent.json npm run dev:worktree
```

The configuration selects a local executable directly, with no shell interpolation. The development launcher passes its environment to the Dev app it launches when you choose Apply in Dev; a Dev app that is already running keeps its earlier environment, so quit it first. The external adapter never installs Hermes. With no configuration, official and development apps continue to use Hermes. Invalid explicit configuration fails rather than falling back to Hermes or silently creating a new profile. Release apps honor this configuration, and with it `WORLDLET_TOOLS_PYTHON`, as the explicit opt-in described in [Release environment overrides](../../core/agent/PORTABILITY.md#release-environment-overrides). The external process never receives the included-model token or other stored credentials.

The subprocess receives an isolated working directory and HOME for private/setup/sample use. Environment variables containing provider credentials are not inherited. A real adapter should obtain its own credentials from its chosen secure store. Connected-source service operations, Hermes model setup and background routines are not provided by this example. Steering is advertised unsupported. This implementation starts a process per request; persist sessions in `WORLDLET_AGENT_HOME` if your harness needs them.

## JSONL protocol

1. Worldlet sends `{"type":"hello","protocolVersion":1}`.
2. Adapter replies with `hello`, matching version/id, and boolean capabilities: `streaming`, `tools`, `cancel`, `steer`, `memory`, `sessions`.
3. Worldlet sends `{"type":"request","id":"turn","body":{...}}`. Body currently contains an action (`status` or `chat`), text, scoped context, session identifier, and companion style.
4. Every subsequent adapter event includes the request ID. Streaming uses `response_start` and `delta`; `tool` requests include `id`, `name` and object `args`.
5. Worldlet executes tools through the existing permission gateway and returns `tool_result` with the matching tool ID and result. Report failures honestly.
6. Finish with `{"type":"result","requestId":"turn","value":{"message":"..."}}`, or an `error` with a message.

Only protocol JSON goes to stdout. Diagnostics go to stderr (currently discarded by the host). The host bounds line/output size and total turn time, validates events, and terminates the process on cancellation. It escalates termination after one second if the child does not exit. This is an integration boundary, not an OS sandbox for untrusted executables.

## Validation

### Foreground conversation and environment

`session` identifies the single foreground Fox conversation in the host-owned identity/privacy scope. Do not derive a different session from Applet or content IDs. Private, practice and setup scopes remain separate; background/Applet jobs use their own sessions and actors.

`context` is the current turn's environment, not instructions or a transcript. Replace the previous view with it; navigation does not authorize actions or retarget pending work. Idle navigation updates the UI environment immediately; protocol v1 sends its snapshot at the next turn, not an unsolicited background prompt. Active work keeps its original snapshot.

`history` contains up to six prior visible `{role, text}` messages (2,000 characters each), excluding the current request. An adapter with `sessions=false` should use it for continuity; a persistent session adapter must not replay it into an existing transcript. Longer history remains accessible through companion recall. Hermes owns its persistent transcript; stateless adapters use the shared foreground history. The deterministic example still is not a memory-capable language model.

### Checks

- `npm run test:electron` (module `agent-runtime`) drives the Electron adapter (`platform/electron/src/modules/agent-runtime/external.ts`) with a real Python executable fixture and no Hermes: handshake, status capabilities and minimal environment, a streamed turn with a World tool round trip, cancellation, and a bad configuration selecting the unavailable adapter. Protocol mismatch, adapter-wide shutdown and unsupported-service isolation were covered by a Swift fixture that retired with #996 and are not yet ported.
- `node scripts/external-agent-ui-check.ts` runs this real Python adapter through the bundled UI and existing World tool gateway. It verifies that the Browser Applet opens and replies stream, without Hermes calls. A real-window Electron check is not yet ported; a web fixture is not evidence of the whole app lifecycle.

## Optional local helpers

External mode never prepares Hermes for speech or local CLI inventories. Helpers use `WORLDLET_TOOLS_PYTHON` (absolute executable path). Without it the host tries `/usr/bin/python3`; where that does not exist (Windows) it reports that the variable is needed. Set a compatible Python with pip for optional MLX Whisper; the system Python may be too old for MLX. Failure to prepare local speech does not prevent text chat. The development launcher forwards this setting. The official Hermes composition continues to reuse its prepared Python environment.

The example has no scheduled-task service. Opening the app does not start Hermes cron or simulate schedule results. Source and model-configuration services are explicitly unsupported; these requests do not get routed into the chat executable.

A real-window check (actual World window, subprocess bridge, Browser navigation, archived conversations, Hermes sentinel) existed for the retired native Mac host and is not yet ported to Electron.

## Capability enforcement

Handshake capabilities must be JSON booleans, not numbers. Status reports use those negotiated capabilities. `tools=false` forbids tool events; `streaming=false` permits a final response without deltas but forbids streaming events. Tool IDs must be unique within a turn, preventing accidental replay. Chat results require a nonempty bounded final message.

The executable transport currently has no steering request/acknowledgement implementation, so adapters must advertise `steer=false`; a contradictory handshake fails explicitly. Cancellation always permits host process termination, even if an adapter has no graceful cancellation capability. `memory` and `sessions` describe adapter-owned persistence; they do not transfer ownership of Worldlet's portable archive.

Shared Core (`harnessHandshake`, `harnessReceive`) enforces these boundaries; the Electron `agent-runtime` check exercises them with a real subprocess. The Swift fixture for an adapter with final responses but no streaming retired with #996 and is not yet ported. `recall companion` demonstrates reading imported Worldlet-owned memory through `read_companion_archive`.

## Optional services for a real Harness adapter

Keep the six required capabilities above. Optional `modelConfiguration` and `routines` must be booleans; omitted means false. The host validates them before sending sensitive configuration or scheduled work.

- `modelConfiguration=true`: support `modelCatalog`, `modelConfigure`, and `modelRepair` with the Worldlet model-access response shapes. `modelLogin` is not supported by executable protocol v1; sign in through the Harness itself.
- `routines=true`: accept `routine_tick` with `_background=true`; atomically claim due jobs and return a result object, or an empty/no-op result when none are due. Worldlet provides a periodic awake clock, private-context consent and cancellation. Background calls cannot execute interactive World tools. The backend must deduplicate claims across restarts and interrupted calls; this flag does not provide a schedule CRUD or source-authorization protocol.

Worldlet owns the user-facing schedule configuration and policy. A custom backend must integrate its management operations before that experience can be offered. This example deliberately advertises neither optional capability. See `scripts/fixtures/harness/` for protocol-only test fixtures, not a production scheduler.
