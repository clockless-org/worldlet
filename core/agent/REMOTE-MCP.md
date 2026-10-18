# Remote MCP

Agents in the cloud can use a person's World the same way local Agents do: a ChatGPT, Claude or Cursor connector, or an Agent session running on another machine. They reach the `worldlet` MCP server on the person's own computer through an HTTPS front at `https://mcp.worldlet.ai/<room>`. The person allows each connection on a card in Attention, and from then on it is an Agent of its own, with its own Grants and audit ([GRANTS.md](GRANTS.md)).

Remote access is on by default (owner decision 2026-10-17): the installed app's first run makes the address and keeps the room open, so the person only copies the address. Nothing gets in until the person allows a connection on a card or makes a token. **Turn off** in Settings › Agent › Access, or `worldlet remote off` on the [Node host](../../platform/node/README.md#the-worldlet-command), closes the room and stays off after restarts. Development builds, release checks and libraries other than the installed app's own stay off until turned on. Remote access works while the computer is on and Worldlet is running.

## Connect a connector

1. In Worldlet, open Settings › Connectors and choose **Copy address** under **Use your World in Claude or ChatGPT** (**Turn on** first if it was turned off). The same address and Copy address are under Remote access in Settings › Agent › Access.
2. Add the address as a remote MCP server in the client:
   - **Claude** (claude.ai, the desktop app, and cloud sessions that use the account's connectors): Settings › Connectors › Add custom connector. Paste the address and leave the OAuth fields empty.
   - **ChatGPT**: Settings › Connectors (Apps) › Create, with developer mode on where the plan asks for it. Paste the address as the MCP server URL and choose OAuth.
   - **Cursor**: add it to `~/.cursor/mcp.json` as `{"mcpServers":{"worldlet":{"url":"https://mcp.worldlet.ai/<room>"}}}`, then choose Connect in Cursor's MCP settings.
   - **Any other MCP client** that speaks Streamable HTTP and OAuth 2.1 with dynamic client registration works the same way.
3. The client opens a page that shows a four-digit code and waits. In Worldlet, a card in Attention names the client, where it returns and the same code. Choose **Allow** only if the code matches. With Services connected, the card says so in plain words: **Allow** also lets it read them ("Allow also lets it read your GitHub and PostHog"), and **Allow without them** keeps them private.
4. The client returns signed in. Its tools are `describe_world_tools` and `call_world_tool`, the same two a local Agent gets.

What the new Agent may do starts with the default Grants: reads, drafts for your review and the browser link. **Allow** adds **Can read <Service>** for each Service connected when it signs in (the host's `services`, given when its code is redeemed), which also lets it search the World's saved context of those Services; **Allow without them** does not. Give it more under its name in Settings › Agent › Access, for example **Can read GitHub**, **Can ask you** or **Can see your board**. **Revoke** ends its connection at once, its refresh token included.

## A token for a script or another computer

An Agent that cannot open a browser, such as a script, a daemon on another computer or a scheduled job, uses a token instead. Under Remote access, open **For a script or another computer**, type the Agent's name and choose **New token**, or run `worldlet remote token "<name>"` on the Node host. The token is shown once. The Agent sends it as `Authorization: Bearer <token>` with MCP requests to the same address.

The token makes an Agent of its own (kind `remote`, Harness `token`), listed in Settings › Agent › Access with the default Grants, its own audit and Revoke. It does not run out. Making a new token for the same Agent (`remoteMcp` `token` with its `id`) stops the old one, and Revoke ends it. Only its SHA-256 hash is kept, in the vault. Anyone who has the token can act as that Agent, so keep it as secret as a password.

**New address** ends every connection and registration, and each client must be added again. **Turn off** stops the address answering but keeps it, so turning it on again needs no new connectors.

## How it works

- **The front** (the website Worker in the operations repository, `worker/mcp-front.ts`) only forwards. It sends each HTTP request to the computer over one WebSocket and sends the answer back. It stores nothing: no D1 table, no Durable Object storage, no logs of bodies or headers. Cloud clients only speak HTTPS, so TLS ends at the front, which sees requests in transit but keeps none of them.
- **The room** is the first 32 hex characters of `sha256(<host token>)`. The computer opens `wss://worldlet.ai/api/mcp-host/<room>` with the subprotocols `worldlet-mcp-host.v1, host.<token>`, and the front checks that the token hashes to the room. The front keeps no list of rooms, and making a token for a given room would mean reversing SHA-256.
- **Frames.** The front sends `{t:'req',id,method,base,path,query,headers,body}`. `base` is the public address (`https://mcp.worldlet.ai/<room>`, or `https://worldlet.ai/mcp/<room>` on the main domain), `path` is the path inside it, and only `authorization`, `content-type`, `accept`, `mcp-protocol-version` and `mcp-session-id` are forwarded. The computer answers with `{t:'res',id,status,headers,body}`. With no computer connected, the front answers 503, and with no answer in 120 seconds it answers 504.
- **On the computer** (`remote-mcp.ts` in core, `agent-runtime/remote-mcp.ts` in the host), the server answers:
  - OAuth discovery: protected resource metadata (RFC 9728) and authorization server metadata (RFC 8414), at `/.well-known/<kind>/<room>` as well as under the address itself.
  - Dynamic client registration (RFC 7591). Redirects must be https, this device's loopback, or an app's own scheme. Public clients use none for token authentication; a client that registered a secret must present it.
  - `/authorize`, with PKCE S256 required. It shows the waiting page and puts the consent card in Attention (`remote-mcp-consents` in the ledger, provider `agents`), naming the Services connected now (`remoteConsentItem`). The host action `remoteMcp` answers it with `allow` (with those Services' reads), `allow-basic` or `deny`. The page long-polls `/authorize/wait` until the person answers or ten minutes pass. Only this computer's pages can answer: `remoteMcp` is not in `ROOM_ALLOWED`.
  - `/token`. The authorization code works once and only with its verifier. Redeeming it makes the Agent (`remote-<client>-<random>`, kind `remote`). Access tokens last an hour, and each refresh token works once and is replaced.
  - MCP Streamable HTTP at the address itself: `initialize`, `ping`, `tools/list` and `tools/call`, single or batched, answered as JSON. Each call goes through the standing server's own call (`StandingWorldTools.call`), so it gets the same Grants, `describe_world_tools` filtering and audit.
- **What is kept.** The host token, the registered clients and the SHA-256 hashes of each connection's tokens and of each script token are kept only in the vault (`remote-mcp`). A token itself only ever goes to the client that asked for it.

`node scripts/remote-mcp-check.ts` checks all of it against a fake front: discovery, registration, the consent card, PKCE, refresh, a client secret, script tokens, Deny, expiry, revoke, a new address, reconnecting, and that no token reaches an item, audit entry, ledger row or log.
