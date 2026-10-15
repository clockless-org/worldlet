# The board

The board shows numbers the person tracks: a north-star number, a funnel, the pull requests waiting, signups over time. It is laid out as tabs of blocks. Each block shows one [Service preset](../applets/INTEGRATIONS.md#service-presets), a saved read of GitHub, PostHog or Cloudflare. The board is general: anyone can define their own. A team's board and its presets are data in that person's own World, never code.

The shapes are in [`contracts/board.ts`](../../contracts/board.ts) and the rules in [`board.ts`](board.ts). `node scripts/board-check.ts` checks both.

## A definition

A definition has a title and 1 to 8 tabs. Each tab has an ID, a title and up to 16 blocks, with at most 48 blocks and 20 distinct presets on the whole board. IDs are lowercase letters, digits and `-`, and each tab and block has its own. A block has an ID, a title, a kind, the ID of the preset it shows, and only what its kind takes:

| Kind | Shows | Takes |
| --- | --- | --- |
| `number` | One value: `field` of the first record, or without `field` how many records came back | `field`; `goodAtLeast` and `goodAtMost`, which make the value good inside them and bad outside |
| `funnel` | Named steps, each a field of the first record, with each step's count over the one before it and the last over the first | `steps`: 2 to 8 `{field, label}` |
| `list` | The records, each with its title, its link and up to four fields | `fields`; `limit` (1 to 20, 10 by default) |
| `trend` | One point per record, `y` over `x`, in the order the read returned them, with the latest value and its change from the one before | `x`, `y` |

A definition names presets and fields. It never holds a key or a raw read: a HogQL query or a GitHub search lives in the preset. Titles are one line of up to 80 characters. Control characters, and anything that looks like a password, token or key, are refused. Anything a kind does not take is refused too.

For example, a funnel from one PostHog preset whose HogQL returns one row with the columns `visited`, `downloaded` and `installed`:

```json
{"id":"funnel","title":"This week","kind":"funnel","preset":"weekly-funnel",
 "steps":[{"field":"visited","label":"Visited"},{"field":"downloaded","label":"Downloaded"},{"field":"installed","label":"Installed"}]}
```

## Resolving

`resolveBoard` takes the definition, the saved presets and each preset's read. Each read is either the records the Service returned or why it could not be read. The result is what the board shows: each block's value, or a plain error.

- Each preset is read once, however many blocks show it (`boardPresetIds`).
- Errors stay on their own block: a missing preset, a Service error (its own words, up to 300 characters), a field the read lacks, a value that is not a number, an empty read. The other blocks are unaffected.
- No model is involved. Every value is a field the read returned, or a count or rate computed from fields. Rates are 0 to 1, rounded to three decimals, and are empty after a step of 0.
- Numbers are numbers, or text that is only a decimal number (HogQL may send big counts as text).
- Service text in the result (titles, list fields, trend labels) is data, never instructions.
- Data stays on the device. The only network reads are the presets' own Service reads, which the host makes under the Service's rules and limits.

## On the host

The board is kept in `world.sqlite` (`state.board`) beside its presets, in the person's own World with private context allowed. Agents reach it with `board/read` and `board/define` under their own Grants; no Agent has them by default and a Fox turn never does ([GRANTS.md](../agent/GRANTS.md#the-board)). The person's own view is the host action `board` (`read`). Each preset is read through the World's own Service reader (`read_service` with no Agent turn), at most four at once, and a read is reused for a minute. `node scripts/board-host-check.ts` checks the host.
