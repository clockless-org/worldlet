# Agent identity, Grants and audit

Every Agent that reaches the World through the `worldlet` MCP server is its own identity, with its own list of Grants and its own audit trail. Anyone running Worldlet can see which Agent did what, give one Agent more or less than another, and revoke one without touching the rest.

The shapes are in [`contracts/agent-identity.ts`](../../contracts/agent-identity.ts); the decision is in [`grants.ts`](grants.ts); `node scripts/agent-grants-check.ts` checks both.

## Identity

An `AgentIdentity` has a stable ID (lowercase letters, digits and `-`; it names the Agent's endpoint file and its ledger rows), the name the person knows it by, its Harness (`hermes`, `openclaw`, `claude-code`, `codex`, `pi` or another adapter's ID), whether it runs on this computer (`local`) or another (`remote`), when it was created and last seen, and when it was revoked. A revoked Agent's calls are denied.

## Grants

A `Grant` gives one Agent a list of World gateway `target/action` patterns (`items/query`, `items/*`, `applet:*/launch`, `*/*`; `*` matches anything, including `/`) with:

- **access**: `read` covers reads only; `write` covers reads and writes. The host says whether a call writes (the turn rule's guarded writes and the gateway's write actions).
- **duration**: `standing` runs without asking until it is revoked or expires; `once` lets reads run and sends each write to the person's approval card (Allow once or Deny).
- optional `expiresAt` and `revokedAt`: a Grant past either counts for nothing.

`grantDecision` decides one call, in this order:

1. An unknown or revoked Agent is **denied**.
2. **The turn rule comes first** ([`turn-trust.ts`](turn-trust.ts)): a write the turn has refused, because untrusted content entered it, stays refused whatever the Grants say, with the turn rule's own words. A Grant never widens what a turn may do.
3. With no active Grant of this Agent matching the call, it is **denied**. A write matched only by `read` Grants is denied.
4. A matching `standing` Grant **allows**. Under a `once` Grant a read is **allowed** and a write is **asked**.

`describe_world_tools` lists only the targets one of the Agent's Grants names (`grantCoversTarget`).

## Audit

Each decision becomes one `AgentAuditEntry` (`at`, `agentId`, `target`, `action`, `decision`: `allowed`, `denied` or `asked`, the `grantId` that decided and a short `reason`), kept in the ledger as `agent.audit`. `keepAgentAudit` keeps the newest `AGENT_AUDIT_KEEP` entries per Agent, so a busy Agent never pushes out another's history.

## Who saved what

World items, artifacts and the Attention items built from them carry an optional `agentId`: the Agent that saved them. Hosts stamp it from the token that made the call (`prepareWorldItem` and `mergeArtifact` take it as an argument). A model never sets it: an `agentId` in what a model sends is dropped, and a saved record keeps the Agent that first saved it.

## The standing MCP server

The `worldlet` MCP server registered in an Agent's profile (World tools on Hermes, [PORTABILITY.md](PORTABILITY.md#world-tools-on-hermes)) is where Grants are enforced, on the Electron host and the [Node host](../../platform/node/README.md) alike (`agent-runtime/world-tool-bridge.ts`, `agent-runtime/agent-access.ts`):

- **Its own token and endpoint file.** Each run, each Agent gets a new token, written with the endpoint to `worldlet-mcp-endpoint.<agentId>.json` in its profile (owner-only, removed on quit). Only the token's SHA-256 hash is kept, in the vault (`agent-token:<agentId>`); a call is identified by its token, and an unknown token is answered as if Worldlet were closed. Identities and Grants are kept with Fox's setup choices (`agent_settings`, `agent-access`), so they follow the World and its backups.
- **Default Grants.** An Agent's default Grants are what a call outside any Fox turn could do before Grants existed (`HERMES_CHANNEL_TOOLS` in [`hermes-server.ts`](hermes-server.ts)): a standing `read` Grant for reads and a draft for the person's review, and a standing `write` Grant for `world/link`. They are written again each run so new Applet sources are covered (`channelDefaultGrants`). Worldlet Services (`read_service`: `github/list`, `github/read`, `github/search`, [INTEGRATIONS.md](../applets/INTEGRATIONS.md#github-service); `posthog/query`, `posthog/read`, [PostHog](../applets/INTEGRATIONS.md#posthog-service); `cloudflare/read`, [Cloudflare](../applets/INTEGRATIONS.md#cloudflare-service)) are never in the default Grants, since a Service can return other people's text or personal data: an Agent reads one only through a Grant the person gives it in [Settings › Agent › Access](#settings--agent--access) (`serviceReadGrant`), and a call its Grant admits outside a Fox turn runs its read as the default reads do.
- **Calls.** Outside any Fox turn, a call is a turn of its own that starts untrusted (except the browser link), so the turn rule refuses its writes first. Any refusal but a revoked or unknown Agent's says what such a call may do: `HERMES_CHANNEL_READ_ONLY` for Hermes Agent, `STANDING_OUTSIDE_TURN` (which names no Hermes channel) for another Agent such as Claude Code or Codex. `channelToolReply` (Fox's module) checks the same Grants again before it runs anything. While a Fox turn holds the server, Hermes Agent's calls go to the turn as before (Fox's turns run on Hermes Agent; another Agent's calls are always its own, under its own Grants) (`foxTurnGrant`): reads run, a write the turn's own stream announced runs, and any other write goes to the approval card, which names the Agent (`asked`) (`standingCallDecision`).
- **Discovery.** `describe_world_tools` lists only the targets the Agent's Grants name (`standingActions`).
- **Audit.** Every call's decision is appended to the ledger as `agent.audit`, keyed by the Agent, and only its newest `AGENT_AUDIT_KEEP` entries stay. Last use is stamped on the identity at most once a minute.
- **Revoke.** Revoking an Agent stamps `revokedAt` on it and its Grants, deletes its token hash and removes its endpoint files, so its registered server answers that Worldlet is not open. It stays revoked across runs.
- **Upgrading.** A Hermes Agent registered before per-Agent tokens names the profile's single `worldlet-mcp-endpoint.json`. On the first run after the upgrade, Hermes Agent becomes the `hermes` identity with the default Grants, and that file holds the same token for that run. Its registered entry is outdated, so `hermes mcp add` saves the new file's path and its gateway restarts. The old file goes on quit.

`node scripts/harness-sessions-check.ts` checks the token, the files, migration, default Grants, discovery, audit and revoke against a fixture Hermes Agent.

## Settings › Agent › Access

The Access part of Settings › Agent ([`ui/companion/agent-access.ts`](../../ui/companion/agent-access.ts), host action `agentAccess` in `agent-runtime/index.ts`) lists each Agent, the one used most recently first. For each it shows where it runs, its last use (or when it was revoked), its active Grants in plain words, and its five newest audit entries. Revoke asks once more in the page and then calls `agentAccess` `revoke`. That stamps `revokedAt`, deletes the Agent's token hash and removes its endpoint files. The page names places in the World and what was allowed. It never shows tokens, endpoints or MCP.

Under an Agent that is not revoked, each connected Worldlet Service has a **Can read <Service>** checkbox (Can read GitHub, PostHog, Cloudflare). Turning it on calls `agentAccess` `grantService` with the Agent and the Service's name; turning it off calls `ungrantService`.

Under them, **Can see your board** and **Can set up your board** give or take back the Agent's [board](#the-board) Grants the same way (`agentAccess` `grantBoard` and `ungrantBoard` with the Agent and `read` or `define`).

Under it, **Can ask you** and **Can take work** give or take back the Agent's ask Grants the same way (`agentAccess` `grantAsks` and `ungrantAsks` with the Agent and `ask` or `work`; the page sends no targets; [Agent asks](#agent-asks)). The page shows each change as "You allowed it" or "You turned it off", and an answer as "You answered its ask".

- **What it grants.** One standing `read` Grant, `<agentId>-service-<provider>`, naming exactly that Service's read targets from `SERVICE_ACTIONS` (`serviceReadTargets`): `github/list`, `github/read` and `github/search`; `posthog/query` and `posthog/read`; `cloudflare/read`. The page sends no targets. A name that is not a Service is refused, and so are an unknown or revoked Agent and a Service that is not connected. Off stamps `revokedAt` on that Grant. Revoking the Agent revokes it with the rest, and the default Grants written each run never touch it.
- **Audit.** Each change is one `agent.audit` entry: `target` is the Service, `action` is `grant` or `ungrant`, `decision` is `allowed`. The page shows it as "You let it read" or "You stopped it reading". It does not count as the Agent's last use.
- **Immediately.** The standing server reads the Agent's Grants on every call, so its next `read_service` call runs or is refused without a restart.
- **Who may call it.** These are operations of the same `agentAccess` action as Revoke, so the same pages reach them. A World page on another device does not (`agentAccess` is not in `ROOM_ALLOWED`), and no World tool does.

`node scripts/your-agent-ui-check.ts` checks the list, the Service and ask checkboxes and Revoke. `node scripts/agent-grants-check.ts` and `node scripts/harness-sessions-check.ts` check the targets, refused names, the audit, and a granted Agent's `read_service` call running on the standing server while an ungranted one is refused.

## Agent asks

An Agent can ask the person something, or leave work for an Agent to take, as an `AgentAsk` ([`contracts/agent-asks.ts`](../../contracts/agent-asks.ts)). Core decides every change ([`asks.ts`](asks.ts)); `node scripts/agent-asks-check.ts` checks it.

- **What an ask holds.** An ID the host makes, the posting Agent's `agentId` (stamped by the host from the caller's token; an `agentId` the model sends is dropped), a kind (`ask`, a question for the person, or `input`, work an Agent may take), a title (at most 200 characters, one line), a body (at most 4,000), up to 4 choices, one optional `https` link, tags, a status (`open`, `claimed`, `answered`, `done`, `skipped`) and a revision that each change raises by one. Control characters and anything that looks like a password, token or key are refused, never stored.
- **Limits.** An Agent may have at most 20 asks open or claimed at once.
- **Reading.** An Agent reads only its own asks: the ones it posted and the ones it claimed.
- **Claiming.** Only `input` asks can be claimed, at most 10 per call. A claim holds for 60 minutes; after that, another Agent may claim the ask again.
- **Resolving.** Only the Agent holding the claim resolves an ask, with a note and `https` links, naming the revision it read. A stale revision is refused.
- **The person's answer.** One of the ask's own choices with an optional note, or Done, or Dismiss. An ask takes one answer.
- **Attention.** Each ask is an Attention item from the host's own provider `agents`, written with no model: a task when it offers choices, otherwise an update. It carries the posting Agent's ID and name, so the card says which Agent asks.
- **On the host.** Asks are the World tool `agent_asks`, as the gateway targets `asks/post`, `asks/read`, `asks/claim` and `asks/resolve`, on the standing `worldlet` MCP server of the Electron and Node hosts alike (`agent-runtime/agent-asks.ts`). A call always goes to the Agent's own asks, under its own Grants: the host passes the Agent whose token made it, and the call never goes to a Fox turn. Fox's own turns get an error for them and talk with the person instead. Each ask and its Attention item `ask-<id>` are saved together in `world.sqlite` (`state.agent-asks`, [storage](../items/STORAGE.md)). A call outside any Fox turn never sees another Agent's ask items through `items/query`.
- **Grants.** No Agent may use asks by default, and a Fox turn's Grant never covers them. Settings › Agent › Access gives two standing Grants (`askGrant`), on the `agentAccess` action beside Revoke as `grantAsks` and `ungrantAsks`, each change audited (`grant-ask`, `ungrant-work`, …):
  - "Can ask you" (`<agentId>-asks-ask`): `asks/post` and `asks/read`.
  - "Can take work" (`<agentId>-asks-work`): `asks/claim` and `asks/resolve`.
  Both are `read` Grants: an ask only shows something to the person, as a draft for review does, and is not a guarded write.
- **The card.** The item is final as the host writes it (`attentionContentVersion` 1, its reason "<Agent> asks you"), so it shows in the Attention Center with no model pass. Its card ([`notion-world.ts`](../../ui/shell/notion-world.ts), [`attention-preview.ts`](../../ui/attention/attention-preview.ts)) says "<Agent> asks", shows the ask's choices as pills with an optional note (Reply when it has no choices), and its Done and Dismiss answer the ask itself (`done`, `skipped`). The page sends only the ask's ID, the outcome, the choice and the note: never an Agent or a status. `node scripts/agent-ask-ui-check.ts` checks the card. On the phone the item shows as any other Attention item, and its Done or Dismiss settles the ask as below.
- **Answers.** The person answers with the `agentAsk` action (`answer`: the ask's ID, `answered` with one of its choices and an optional note, `done` or `skipped`). It is in `ROOM_ALLOWED`, like `worldItemStatus` (its only operation is `answer`), so a World page on another device answers asks as it settles any item. Done or Dismiss through the item's ordinary status (`worldItemStatus`) settles the ask on its next call. Each answer is one `agent.audit` entry for the asking Agent (`answer`). `node scripts/agent-asks-host-check.ts` checks this on a real `world.sqlite` through the standing server; `harness-sessions-check` and `agent-grants-check` check the Grants.

## The board

The [board](../board/README.md) is the person's tabs of blocks over Service presets. An Agent reaches it through the World tool `world_board`, as the gateway targets `board/read` and `board/define`, on the standing `worldlet` MCP server of the Electron and Node hosts alike (`agent-runtime/board.ts`).

- **Grants.** No Agent may use the board by default, and a Fox turn's Grant never covers it, read or define: like asks, only the calling Agent's own Grants decide (`OWN_GRANT_TARGETS`). Fox's own turns get an error for `world_board`. Settings › Agent › Access gives two standing Grants (`boardGrant`), each change audited (`grant-read`, `ungrant-define`, …):
  - "Can see your board" (`<agentId>-board-read`): `board/read`.
  - "Can set up your board" (`<agentId>-board-define`): `board/define`. It does not include reading, and reading does not include setting up.
  Both are `read` Grants: defining changes only what the person's own board shows, which they can see and change back, and is not a guarded write.
- **Reading.** `board/read` (optionally one `tab`) returns the definition, its revision, who defined it, the presets it names and each block's value or error, marked as untrusted content. Each preset is read once through the World's own Service reader, with no Agent turn and no model; a read is reused for a minute. A block whose Service the calling Agent's own Grants do not let it read (`read_service` would be refused) shows that on the block, and that Service is not read for it: the board never shows an Agent a Service it cannot read itself.
- **Setting up.** `board/define` replaces the whole definition and may save up to 20 Service presets with it, naming the revision it read (0 with no board yet). A stale revision is refused and the answer names the current one. Anything not valid in the definition or a preset refuses the whole call, and nothing changes. The board keeps the defining Agent's ID, stamped from its token.
- **Storage and the person.** The board is `state.board` in `world.sqlite`, saved with its presets in one transaction ([storage](../items/STORAGE.md)), in the person's own World with private context allowed. The host action `board` (`read`, optionally a `tab`) shows the person every connected Service; it is not in `ROOM_ALLOWED`.
- **Audit.** Every call's decision is one `agent.audit` entry for the calling Agent, as for any World tool. `node scripts/board-host-check.ts` checks all of this on a real `world.sqlite` through the standing server; `agent-grants-check` checks the Grants and `your-agent-ui-check` the checkboxes.
