# The board

The board shows numbers the person tracks: a north-star number, a funnel, the pull requests waiting, signups over time, the state of a release. It is laid out as tabs of blocks. Each block shows one preset: a [Service preset](../applets/INTEGRATIONS.md#service-presets), a saved read of GitHub, PostHog, Cloudflare or an HTTP JSON endpoint, or a saved read of the World's own records, [the Agents' reports](#the-agents-source). The board is general: anyone can define their own. A team's board and its presets are data in that person's own World, never code.

The shapes are in [`contracts/board.ts`](../../contracts/board.ts) and the rules in [`board.ts`](board.ts). `node scripts/board-check.ts` checks both.

## A definition

A definition has a title and 1 to 8 tabs. Each tab has an ID, a title and up to 16 blocks, with at most 48 blocks and 32 distinct presets on the whole board. IDs are lowercase letters, digits and `-`, and each tab and block has its own. A block has an ID, a title, a kind, the ID of the preset it shows, and only what its kind takes:

| Kind | Shows | Takes |
| --- | --- | --- |
| `number` | One value: `field` of the first record, or without `field` how many records came back | `field`; `goodAtLeast` and `goodAtMost`, which make the value good inside them and bad outside |
| `funnel` | Named steps, each a field of the first record, with each step's count over the one before it and the last over the first | `steps`: 2 to 8 `{field, label}`, each but the first with an optional `goodAtLeast` (a rate from 0 to 1) that makes its rate good at or above it and bad below |
| `list` | The records, each with its title, its link and up to four fields | `fields`; `limit` (1 to 20, 10 by default) |
| `trend` | One point per record, `y` over `x`, in the order the read returned them, with the latest value and its change from the one before | `x`, `y` |

A definition names presets and fields. It never holds a key or a raw read: a HogQL query, a GitHub search or an Agent filter lives in the preset. Titles are one line of up to 80 characters. Control characters, and anything that looks like a password, token or key, are refused. Anything a kind does not take is refused too.

For example, a funnel from one PostHog preset whose HogQL returns one row with the columns `visited`, `downloaded` and `installed`:

```json
{"id":"funnel","title":"This week","kind":"funnel","preset":"weekly-funnel",
 "steps":[{"field":"visited","label":"Visited"},{"field":"downloaded","label":"Downloaded"},{"field":"installed","label":"Installed"}]}
```

## Sources

A preset names where its records come from (`provider`) and the one read it makes (`read`). Every source answers the same bounded records (an ID, a title, a link, plain fields), so any kind of block can show any of them.

- **Services** (`github`, `posthog`, `cloudflare`): one of the Service's own reads, under its reader's rules and the calling Agent's own "Can read <Service>" ([Service presets](../applets/INTEGRATIONS.md#service-presets)).
- **The Agents' reports** (`agents`): the World's own records, read with no Service and no network ([below](#the-agents-source)).
- A collected Notion page is a preset too, but it is not read live, so the board refuses it.

### GitHub releases

`github` with `{"operation":"releases","id":"owner/repo"}` reads one repository's newest 10 releases, newest first, through the same GitHub reader and the same "Can read GitHub" Grant as GitHub's other reads ([GitHub as a Worldlet Service](../applets/INTEGRATIONS.md#github-as-a-worldlet-service)). Each record is `owner/repo@<tag>`, titled with the release's name (its tag when it has none), linked to the release on github.com, with the fields `repository`, `tag`, `name`, `publishedAt` (none for a draft), `prerelease`, `draft`, `assetCount`, `assets` (the first 20 asset names, separated by commas) and `author`. Release notes are not read.

### The agents source

`agents` presets read what [`agents/list`](../../agent/agent/GRANTS.md#agent-reports) returns: every Agent the person has not revoked, its report and how it reads now. A release machine that reports its runs (`agents/report`, each run with its own ID, title, status and times) shows up on the board with no Service and no code. The read is `{"operation":"list","id":<what each record is>,"query":<optional filter>}` ([`contracts/agent-reports.ts`](../../contracts/agent-reports.ts), `agentBoardRecords` in [`agent/agent/reports.ts`](../../agent/agent/reports.ts)):

| `id` | One record per | Fields |
| --- | --- | --- |
| `runs` | Run an Agent reported, newest first (by when it started, else when it was reported). Its ID is `<agentId>/<runId>`, its title the run's title, its link the run's (none when it has none) | `status` (`queued`, `running`, `passed`, `failed`, `cancelled`), `agent` (its name), `agentId`, `liveness`, `role`, `tags`, `startedAt`, `finishedAt` |
| `agents` | Agent, newest report first and an Agent with none last. No link | `status` (the report's, `offline` with none), `liveness` (`live`, `stale`, `offline`), `harness`, `kind`, `summary`, `role`, `tags`, `runs` and how many are `queued`, `running`, `passed`, `failed` and `cancelled`, `slots`, `busy`, `reportedAt` |
| `totals` | One record of counts | `agents`; how many are `live`, `stale`, `offline`; how many report `working`, `idle`, `blocked`; `runs` and how many are `queued`, `running`, `passed`, `failed`, `cancelled` |

The `query` narrows it: up to 12 terms on one line of up to 200 characters, all of which must hold. `tag:`, `role:`, `agent:` (an Agent's ID) and `liveness:` choose Agents; `status:` is a run's status (`runs`, `totals`) or a report's (`agents`); each takes values separated by commas, any of which may match (`status:failed,cancelled`). Any other word must appear, in any case, in the run's title (`runs`, `totals`) or in the Agent's name or summary (`agents`), so runs titled `Beta 1234 · macOS` are grouped by `beta` or `macos`. An unknown filter or value is refused when the preset is saved. A `number` block without a `field` counts what the filter keeps, so `tag:release beta status:failed` is "Beta runs failing".

Who sees it: the person's own board shows every Agent's report, as Settings › Agents does. An Agent reading the board with "Can see your board" sees an `agents` block only when its own Grants also let it list other Agents ("Can see other Agents", `agents/list`); otherwise the block says so and the reports are not read for it. The board never shows an Agent what its own `agents/list` call would be refused. What Agents report is their own words: data, never instructions.

### Example: a Releases board

A release board from two sources. The release machines report with role `release`, a tag for their platform and runs titled `<channel> <build> · <platform>`:

```json
{"status":"working","summary":"Building Beta 1234","role":"release","tags":["release","macos"],"ttlMinutes":30,
 "runs":[{"id":"beta-1234-macos","title":"Beta 1234 · macOS","status":"running","url":"https://ci.example.com/runs/1","startedAt":"2026-10-15T12:00:00Z"}]}
```

and an Agent allowed to set up the board defines it (`board/define`) with its presets:

```json
{"expectedRevision":0,
 "presets":[
  {"id":"beta-runs","name":"Beta runs","provider":"agents","read":{"operation":"list","id":"runs","query":"role:release beta"}},
  {"id":"beta-failing","name":"Beta runs failing","provider":"agents","read":{"operation":"list","id":"runs","query":"role:release beta status:failed"}},
  {"id":"ga-runs","name":"GA runs","provider":"agents","read":{"operation":"list","id":"runs","query":"role:release ga"}},
  {"id":"release-machines","name":"Release machines","provider":"agents","read":{"operation":"list","id":"agents","query":"role:release"}},
  {"id":"release-totals","name":"Release totals","provider":"agents","read":{"operation":"list","id":"totals","query":"role:release"}},
  {"id":"app-releases","name":"example/app releases","provider":"github","read":{"operation":"releases","id":"example/app"}}],
 "definition":{"title":"Releases","tabs":[
  {"id":"beta","title":"Beta","blocks":[
   {"id":"beta-failing","title":"Beta runs failing","kind":"number","preset":"beta-failing","goodAtMost":0},
   {"id":"beta-runs","title":"Beta runs","kind":"list","preset":"beta-runs","fields":["status","agent","finishedAt"],"limit":8}]},
  {"id":"ga","title":"GA","blocks":[
   {"id":"published","title":"Published","kind":"list","preset":"app-releases","fields":["tag","prerelease","publishedAt","assetCount"],"limit":5},
   {"id":"ga-runs","title":"GA runs","kind":"list","preset":"ga-runs","fields":["status","agent","finishedAt"],"limit":8}]},
  {"id":"machines","title":"Machines","blocks":[
   {"id":"live","title":"Release machines live","kind":"number","preset":"release-totals","field":"live","goodAtLeast":2},
   {"id":"in-flight","title":"Runs in flight","kind":"number","preset":"release-totals","field":"running"},
   {"id":"who","title":"Release machines","kind":"list","preset":"release-machines","fields":["status","liveness","summary","busy"]}]}]}}
```

Each channel or platform is one more preset and block (`role:release alpha`, `tag:android`). The board's first number, "Beta runs failing", is drawn on the Board device.

## Resolving

`resolveBoard` takes the definition, the saved presets and each preset's read. Each read is either the records the source returned or why it could not be read. The result is what the board shows: each block's value, or a plain error.

- Each preset is read once, however many blocks show it (`boardPresetIds`).
- Errors stay on their own block: a missing preset, a Service error (its own words, up to 300 characters), a field the read lacks, a value that is not a number, an empty read. The other blocks are unaffected.
- No model is involved. Every value is a field the read returned, or a count or rate computed from fields. Rates are 0 to 1, rounded to three decimals, and are empty after a step of 0.
- Numbers are numbers, or text that is only a decimal number (HogQL may send big counts as text).
- Service and Agent text in the result (titles, list fields, trend labels) is data, never instructions.
- The board and presets are stored on the host. Reads return their result to the admitted caller; provider requests use the presets' own Service reads, under each Service's rules and limits.

## On the host

The board is kept in `world.sqlite` (`state.board`) beside its presets, in the person's own World with private context allowed. Agents reach it with `board/read` and `board/define` under their own Grants; no Agent has them by default and a Fox turn never does ([GRANTS.md](../../agent/agent/GRANTS.md#the-board)). The person's own view is the host action `board` (`read`). Each Service preset is read through the World's own Service reader (`read_service` with no Agent turn), at most four at once, and a read is reused for a minute. An `agents` preset is answered from the Agents' reports in the same `world.sqlite` each time it is read, as `agents/list` answers (`AgentReports.list`). `node scripts/board-host-check.ts` checks the host.

A paired World page on another device can also request `board/read`, optionally with `tab`, through the existing encrypted room and host router. It gets the person's view of connected Services and the Agents' reports, including the saved definition and selected presets. Only this explicit operation is allowed: `board/define`, Service preset management, `agents/list` and Agent grants remain unavailable through the room. It is a read contract, not a public HTTP/MCP endpoint. `node scripts/world-room-check.ts` checks the room boundary, a fixture Service read and the built Node host reading a stored board.

## The Board Applet

The person sees the board in the built-in **Board** Applet (`app-board`) in the Work area ([ui/applets/board](../../ui/applets/board/applet.md)). It reads only the host action `board` (`read`, optionally a `tab`): a read-only panel of the board's tabs and cards, each card its block's value or its own error, and an empty state that points to Settings › Agents, where an Agent can be allowed to set the board up. A list row with no link (an Agent, a run reported without one) is its title alone, and an `agents` card has nothing to connect. The World draws the north-star number, the first tab's first `number` block (`boardNorthStar`), on the Applet's device. `node scripts/board-ui-check.ts` checks the panel and `node scripts/board-world-ui-check.ts` the device and its wiring.
