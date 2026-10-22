# Your World's address

Every World has its own web address, `https://<room>.worldlet.ai`, and it is the only address you need: open it on any device to reach your World, and connect Claude, ChatGPT or another MCP client at `https://<room>.worldlet.ai/mcp` ([remote MCP](REMOTE-MCP.md)). Nobody else sees anything there unless you allow them. The World, your records and Fox stay on your computer. The address works while that computer is on and Worldlet runs there; when it is off, the page says the World is offline.

## One address, nothing to choose

The address is the room of [remote access](REMOTE-MCP.md)'s connection (owner request 2026-10-22, "再简单点"): 32 letters and digits, the same room as in `mcp.worldlet.ai/<room>`. There is nothing to choose, register or confirm, so a World can never be left without one. Settings › Agents shows it under **Your World's address**: one card with the address and **Copy for Claude or ChatGPT** (its `/mcp`). Browsers, people and shares you allowed are listed under it, each with a way to end it, only when there are some.

- Turning remote access off (`worldlet remote off`) makes the address say your World is offline; Settings then offers **Turn on** on the card.
- A new remote access address (`remoteMcp` `renew`) is a new World address. Browsers and people you allowed must ask again there, because their passkeys belong to the address they were made for; shares are kept.
- Names chosen before 2026-10-22 (and `w-…` default names) are no longer used by Worldlet. The website still answers them until they lapse unconfirmed.

## Your browsers

On another device, open the address and choose **Ask to use this browser**:

1. The browser makes a passkey for this address.
2. A card in Attention on your computer asks whether to allow it, naming the browser and the city it asks from. Choose **Allow** only if you are using that browser right now.
3. **Open your World** signs in with the passkey and opens your whole World in that browser.

From then on, **Sign in with a passkey** is all it takes. Under the address, **Sign out** forgets a browser's passkey. It also changes your World's link for other devices, so a World page that browser still has open closes; copy the link again wherever else you use it.

## Sharing your board

You can share your board, read only. Nothing else in your World is shared. Settings no longer makes share links (owner request 2026-10-22); the host does (`worldAddress` `share`), and Settings lists each share with **Stop sharing**.

- **Share board with people you allow** makes a link. A person who opens it gives their name and chooses **Ask to see it**. Their browser makes a passkey of its own, and a card in Attention asks you whether to let them see the board. Once you allow them, they sign in with their passkey and see the board.
- **Share board with anyone who has the link** makes a link that opens the board with no sign-in.

Each person you allow is listed under **People**, like an Agent of their own: what they may see (only the boards shared with them), when they last looked, and **Remove**. **Stop sharing** ends a link at once, and anyone who could see only that link is removed.

## How it works

- **The website** (the website Worker in the operations repository) serves one static page at the address. The page is the same for everyone and holds no data. The website passes each of the page's requests (`/api/address/…`) to this computer over remote access's connection, as an `address` request (`kind: 'address'` on the front's frame, [REMOTE-MCP.md](REMOTE-MCP.md#how-it-works)), and keeps nothing. For a room address it keeps nothing at all: it finds the World from the label itself. `/mcp` at the address is the World's remote MCP address too.
- **The computer decides everything** ([world-address.ts](world-address.ts); host: `platform/host/modules/gate/world-address.ts`, host action `worldAddress`). It answers only requests for its current room's address.
  - **Passkeys** are WebAuthn credentials whose relying party is the address itself. ES256 and RS256 are taken. Every answer is checked: the challenge is single use and two minutes long, the origin and relying party must be the address, the person must be present, the signature must verify against the kept public key, and a counter that goes back is refused.
  - **Requests to be let in** are cards like a connector's (the ledger's `remote-mcp-consents`, provider `agents`), at most five waiting at once, for ten minutes. Only this computer's pages answer them: `remoteMcp` and `worldAddress` are not in `ROOM_ALLOWED`.
  - **Sessions** last twelve hours and are kept in memory only. Removing a browser or a person ends theirs at once.
- **The owner's World** opens from the World's link for another device (the `world` pairing, [agent/app/README.md](../../platform/web/README.md#the-world-on-another-device)). After a sign-in, the page goes to `/world/<version>/` on the address with the link's fragment. The World bundle and the pairing room are served on the address too, so the World talks to this computer sealed end to end, as from a copied World link.
- **A shared board** is the board as you see it (`board` `read`): its tabs and blocks only, never its presets or reads. Each view by a person you allowed is added to their audit (the last 20).
- **What is kept.** In the vault (`world-address`): the name, the public keys of passkeys with each one's name, the people you allowed with what they may see and their audit, and the shares. Nothing a browser could reuse is kept outside memory, and no session reaches an item, the ledger or a log.

TLS ends at the website, as for remote MCP: it sees requests in transit and keeps none of them.

`node scripts/world-address-check.ts` checks the host with passkeys made the way a browser's authenticator makes them. It covers the room address, the card, sign-in and every refusal, sharing, Remove and Sign out, New address, and that no session reaches an item, ledger row or log line.
