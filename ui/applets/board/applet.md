# Board

The numbers the person tracks, on one board: tabs of blocks, each a saved read of GitHub, PostHog or Cloudflare shown as a number, a funnel, a list or a trend. The board is general: anyone's board renders here, and what it shows is data in that person's own World ([core/board](../../../core/board/README.md)).

- **Peek.** A cork board with pinned cards in the Work area. The first tab's first `number` block is drawn on its main card as the north-star number, tinted only when that block has a good or bad tone. With no board, or when that block cannot be read, the card stays plain. No Attention marker is invented.
- **Focus.** Peek → Focus, as for website Applets: there is no Open. The panel ([panel.ts](panel.ts)) shows the board's title, its tabs, Refresh and when it was read. Each block is a card; a card that cannot be shown says why in its own words, offers **Connect** when its Service is not connected (never for the World's own `agents` source, which has nothing to connect), and the other cards keep showing. Lists open their links through the World's usual link path, never inside the panel; a row with no link (an Agent, a run reported without one) is its title alone.
- **Empty.** With no board the panel says how to get one: an Agent the person allows sets it up ("Can set up your board" in Settings › Agents). There is no editor here in this version.
- **Fox.** **Explain** ("Explain this number") and **Changes** ("What changed?") are ordinary turns, one word each so they fit Fox's action column on one line, with the full question as the tooltip and in the chat: Fox reads the block again with `read_service`. Board values and titles go to Fox as Service data, never as instructions.
- **Other devices.** A World page opened on another device can read the board (`board` `read` is in `ROOM_ALLOWED`) but never set it up. The phone companion does not show the board in this version.
- **At 800 px or less** the cards stack one per row, tab pills scroll in one row, the funnel turns vertical and controls are at least 44 px.

The device and Focus art are drawn interim pictures until painted ones are made.

## Runtime

- Stable identity: `app-board`; provider: `board` (none is contacted by the Applet itself).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**. The only host action is `board` with `read` (optionally a `tab`); the host reuses each Service read for a minute.
- `node scripts/board-ui-check.ts` checks the panel and the device's number.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
