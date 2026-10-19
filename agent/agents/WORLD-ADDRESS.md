# Your World's address

Every World can have its own web address, `https://<name>.worldlet.ai`. Open it on any device to reach your World. Nobody else sees anything there unless you allow them. The World, your records and Fox stay on your computer. The address works while that computer is on and Worldlet runs there; when it is off, the page says the World is offline.

## Choose a name

In Settings › Agents, under **Your World's address**, type a name and choose **Choose**. A name is 3 to 32 lowercase letters or digits, with single hyphens between them. Some names are kept for Worldlet itself (`www`, `mcp`, `api`, `admin` and others). Names are first come, first served, and each World holds one.

- **Change** picks another name. The old one is freed at once. Browsers and people you allowed must ask again at the new address, because their passkeys belong to the old one.
- **Give up this address** frees the name for anyone.
- The address reaches your computer over [remote access](REMOTE-MCP.md)'s connection, so choosing a name turns remote access on. Turning remote access off makes the address say your World is offline. **New address** under remote access keeps your name.

## Your browsers

On another device, open the address and choose **Ask to use this browser**:

1. The browser makes a passkey for this address and shows a four-digit code.
2. A card in Attention on your computer asks whether to allow it. Choose **Allow** only if you are using that browser right now and it shows the same code.
3. **Open your World** signs in with the passkey and opens your whole World in that browser.

From then on, **Sign in with a passkey** is all it takes. Under **Your browsers**, **Sign out** forgets a browser's passkey. It also changes your World's link for other devices, so a World page that browser still has open closes; copy the link again wherever else you use it.

## Sharing your board

You can share your board, read only. Nothing else in your World is shared.

- **Share board with people you allow** makes a link. A person who opens it gives their name and chooses **Ask to see it**. Their browser makes a passkey of its own, and a card in Attention asks you whether to let them see the board. Once you allow them, they sign in with their passkey and see the board.
- **Share board with anyone who has the link** makes a link that opens the board with no sign-in.

Each person you allow is listed under **People**, like an Agent of their own: what they may see (only the boards shared with them), when they last looked, and **Remove**. **Stop sharing** ends a link at once, and anyone who could see only that link is removed.

## How it works

- **The website** (the website Worker in the operations repository) serves one static page at the address. The page is the same for everyone and holds no data. The website passes each of the page's requests (`/api/address/…`) to this computer over remote access's connection, as an `address` request (`kind: 'address'` on the front's frame, [REMOTE-MCP.md](REMOTE-MCP.md#how-it-works)), and keeps nothing. Its one record is the name registry: each name and the SHA-256 of its World's room. A name is claimed, confirmed (on each start and daily), renamed and released only with the World's host token. `/mcp` at the address is the World's remote MCP address too.
- **The computer decides everything** ([world-address.ts](world-address.ts); host: `platform/electron/src/modules/agent-runtime/world-address.ts`, host action `worldAddress`). It answers only requests for the name it holds now.
  - **Passkeys** are WebAuthn credentials whose relying party is the address itself. ES256 and RS256 are taken. Every answer is checked: the challenge is single use and two minutes long, the origin and relying party must be the address, the person must be present, the signature must verify against the kept public key, and a counter that goes back is refused.
  - **Requests to be let in** are cards like a connector's (the ledger's `remote-mcp-consents`, provider `agents`), at most five waiting at once, for ten minutes. Only this computer's pages answer them: `remoteMcp` and `worldAddress` are not in `ROOM_ALLOWED`.
  - **Sessions** last twelve hours and are kept in memory only. Removing a browser or a person ends theirs at once.
- **The owner's World** opens from the World's link for another device (the `world` pairing, [agent/windows/README.md](../windows/README.md#the-world-on-another-device)). After a sign-in, the page goes to `/world/<version>/` on the address with the link's fragment. The World bundle and the pairing room are served on the address too, so the World talks to this computer sealed end to end, as from a copied World link.
- **A shared board** is the board as you see it (`board` `read`): its tabs and blocks only, never its presets or reads. Each view by a person you allowed is added to their audit (the last 20).
- **What is kept.** In the vault (`world-address`): the name, the public keys of passkeys with each one's name, the people you allowed with what they may see and their audit, and the shares. Nothing a browser could reuse is kept outside memory, and no session reaches an item, the ledger or a log.

TLS ends at the website, as for remote MCP: it sees requests in transit and keeps none of them.

`node scripts/world-address-check.ts` checks the host with passkeys made the way a browser's authenticator makes them. It covers claiming and renaming, the code and card, sign-in and every refusal, sharing, Remove and Sign out, New address, and that no session reaches an item, ledger row or log line.
