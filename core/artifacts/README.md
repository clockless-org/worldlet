# Artifacts

An **artifact** is a card Fox puts in front of the person: an information card, in practice a small HTML page (owner decisions 2026-10-05 and 2026-10-06). An Attention card is one kind. A table, plan, comparison or chart that Fox lays out in conversation is another. They share one structure, a size, and a place where the person finds them all again.

An Applet is a place the person goes back to. An artifact is a thing Fox shows. Artifacts come from a source Applet (Attention), from the conversation, or, later, from asking Fox to make something; an interactive one the person keeps becomes an Applet. The design page is [Artifact 和 Applet](https://claude.ai/artifact/NefchueyCauWMSjRbjeBN5).

## Structure

Every artifact has the same parts:

- **Head**: where it came from (an Attention category such as "Coming Up", or "From this conversation"), the title, and for Attention its illustration.
- **Facts**: time, place, related items. The Attention card's time and venue line.
- **Body**: Markdown with tables, and an optional bar chart of up to eight nonnegative values Fox verified.
- **Sources**: the original mail, page or conversation.
- **Actions**: owned by the host, by kind. Attention has Done, Dismiss and Later; an answer has the next steps Fox offered (see [Actions](#actions)); every artifact has its size control and ×.
- **Fox's line** stays in Fox's bubble, never on the card.

## One card

An artifact is one card at most (owner Order 2026-10-07): what Fox shows fits its card, the size of a large card on the main stage, with no second page. Fox writes to fit rather than Worldlet cutting afterwards:

- Every request for an artifact (`show_artifact`, the day's plan and summary, a theme, a meeting's summary) carries the one-card rule (`ARTIFACT_ONE_CARD_RULE`): the takeaway in one or two lines, then at most three short parts under bold labels or one table of up to six rows and four short columns; about 900 characters for medium and 1,800 for large, a Chinese, Japanese or Korean character counting two.
- `show_artifact` refuses a body or detail past the large card (`artifactFitProblem`, weighed by `artifactWeight`: wide characters two, each line or table row twenty, link targets nothing, a chart forty a bar) and tells Fox how much to cut, so Fox shortens it and shows it again. Artifacts kept before this rule open as they were.

## Fits its card

An artifact never scrolls (owner Order 2026-10-09): how much it shows follows the size of its card, down to one sentence on the smallest. This replaces the 10-07 rule that a longer body scrolls inside the card. Fox writes the answer at three lengths, and the card shows as much as its size holds:

- **Brief**: `brief`, the whole answer in one sentence (up to 160 characters, no Markdown). Without one (an Attention card, an artifact kept earlier) the card uses the body's first sentence (`artifactBrief`).
- **Body**: `body`, as before.
- **Detail**: `detail`, optional, a fuller body in the same layout for a card with room to spare, within the same one-card budget.
- **Blocks** come most important first: a smaller card leaves out the last ones.

The card tries these steps, fullest first, and keeps the first that fits its room without overflowing (`artifactFitSteps`, drawn by `ui/companion/artifact-fit.ts`): the detail with everything, the body with every block, the body leaving out the last blocks one at a time, the body without its chart, then the brief alone. One rule for the World card, the corner card over an Applet and the Journal's cards. When the card's room changes (its size control, a window resize, Fox moving aside) it picks again at once; no model is asked. When something is left out, the World card shows **Show all**, which makes it large (kept as its size); in an Applet's corner, which has no size control, Show all lets the card reach down Fox's column and **Show less** gives the room back. A Journal card says **More** and opens in the World. What the person ticks or sets on a block stays with the artifact, including blocks a smaller card left out.
- They share one style, the Attention card's: its paper, title, accent labels; a heading of any level in the body reads as the accent label, and tables, lists and links use the same ink. The Attention card is the design system (owner Order 2026-10-08: "artifact一定一定一定要统一设计system，attention card就是我们标准的design system"): everything drawn on an artifact, its chart and [blocks](#blocks) included, uses its accent, ink, rules and outline or filled buttons, and nothing brings a look of its own.

## Sizes

| Size | Where | Used for |
| --- | --- | --- |
| Small | Desktop, a short narrow card above Fox, who stays in the middle; one cell of a Journal page (owner decision 2026-10-07) | A few lines: a short answer, an Attention card or a page Fox made in the Journal |
| Medium | Desktop, a wide card above Fox, who stays in the middle; it grows with its content up to its cap; two cells side by side in the Journal | Explanations, a small table or chart, a meeting's summary, a theme |
| Large | Desktop, the main stage right of the Attention Center, with Fox and the conversation in the right-hand column as beside an Applet; two by two in the Journal | The day's plan and summary, anything with several parts |
| Phone | One column the width of the screen | Every card on the iPhone and Android |
| In an Applet | Desktop, a small card in the top-right corner at the head of Fox's column, so the Applet stays in view (owner Order 2026-10-07); no size control: it shows what fits the corner, and Show all lets it reach down Fox's column | Whatever Fox shows while the person is in an Applet |

Fox names the size with `show_artifact` (`small`, `medium`, `large`, or null). Without one, `defaultArtifactSize` picks from the content: a few lines are small, a table, a chart or more than a few lines medium, a body heavier than a medium card large. A named size is kept even when it is smaller than the content (`artifactSizeFor`): the card shows what fits it ([Fits its card](#fits-its-card)). The arrows beside × grow a card a step at a time and shrink a large one to medium, and the choice is kept with the artifact. Windows narrower than 1340px, and the onboarding tour, which seats Fox under the card it lights, keep Fox under a large card too ([Conversation](../../ui/companion/CONVERSATION.md)).

## Actions

An artifact can go beyond reading at four levels (owner decision 2026-10-06; blocks, owner Order 2026-10-08):

1. **Read only**: the body and its sources. The card never pages or scrolls: it shows the fullest version that fits ([Fits its card](#fits-its-card)).
2. **Blocks**: see [Blocks](#blocks).
3. **Next steps**: `show_artifact` takes up to three `actions`, each a short label and the request it stands for ("Book TAC" → "Book the TAC Security assessment"). They are buttons on the card. A click drafts the request in Fox's message bar, and it reaches Fox only when the person sends it, so Fox does it with its usual tools and confirmations. The card itself changes nothing in the World, and a card Fox made after reading an email or web page can never speak for the person: they see the words before they send them. The actions are kept with the artifact and come back when it is opened again.
4. **Interactive**: a page Fox makes for a moment ([Moment Applets](../widgets/README.md)): checklists, guides, timers, with what the person ticks kept and synced with the phone. It runs sandboxed and never sees World data. It is already an Applet while its moment lasts, and **Keep it** keeps it for good. This is how an artifact becomes an Applet. A card from the conversation has no Keep as Applet on it (owner request 2026-10-07: set aside for now; if it comes back, the button stands beside Fox, not on the card).

## Blocks

An answer is drawn in the [card system](../../ui/attention/CARD-SYSTEM.md) (owner Orders 2026-10-08): `show_artifact` names its `tone` (moss, teal, honey, sage, clay or plum, by what it is about) and its `art` (a painted scene, `none`, or null for the card to choose), and under a short body it takes up to three **blocks**. These are Worldlet's own components, drawn by the host. Fox only fills them in, never with HTML:

| Block | What Fox gives | On the card |
| --- | --- | --- |
| `callout` | A label, one line, and a tone | The line that matters most, on the tone's wash |
| `stats` | A label and 2 to 4 figures, each a value, label and optional note | Figure tiles |
| `facts` | A label and up to 5 rows, each an icon (time, place, cost, person, link, note) and text | Icon rows like the Attention card's time and venue |
| `steps` | A label and 2 to 6 steps, each a title, optional detail and optional time | A numbered thread with times |
| `compare` | A label and 2 or 3 options, each a name, optional note, up to 3 points, and whether it is the pick (at most one) | Columns, the pick outlined and marked Recommended |
| `tags` | A label and up to 8 short labels | Chips |
| `checklist` | A label and up to 8 items | Items the person ticks, with a count; the ticks are kept |
| `scale` | A label, a unit, the base count with its min, max and step, and up to 8 amounts for the base | − and + set the count and every amount follows (`scaledAmount`); the count is kept |
| `choice` | A label and 2 to 4 options, each a label and request | Buttons that draft the request in Fox's message bar, as a next step does (owner Order 2026-10-08, after ChatGPT's Intelligent UI: "我们自己做一下") |
| `parts` | A label and 2 to 6 parts, each a name and a detail | One part's detail at a time; ← → move between them |

Optional texts are empty strings. Nothing on a block changes the World, and a choice reaches Fox only when the person sends it. Blocks count toward the one-card budget (`artifactWeight`, measured by the room each takes) and make a card at least medium when Fox names no size; Fox lists them most important first, since a smaller card leaves out the last ones. A block the card cannot draw is refused (`artifactInputProblem`) or, when stored, dropped (`readArtifactBlocks`). The tone, picture and blocks are kept with the artifact; the Journal shows them still, as the person left them, and opened again in the World they work again. Attention cards have none. Pages that need more than this (timers, maps, games) are still [Moment Applets](../widgets/README.md).

## Kept in the World

Every artifact is kept in this World:

- `show_artifact` saves an **answer** artifact (`art-…`) with its Markdown, chart, size and the place Fox spoke in.
- A page about a theme of the person's brought conversations is an answer artifact too ([Themes](../ongoing/README.md#themes)).
- A meeting's summary is an answer artifact too: when a Meetings transcript ends, the World asks Fox for it and Fox shows it with `show_artifact` ([Meetings](../../ui/applets/meetings/README.md#live-transcript)).
- Opening an Attention card saves an **attention** artifact (`attention-<item>`) with its title, category and summary. Opening the same item again updates the same artifact and moves it up; the World item stays the truth, and Done, Dismiss and Later still settle the item.

The **Journal** (owner decisions 2026-10-06: not an Applet; 2026-10-07: all the artifacts together are one journal, a page a day, in three sizes laid out nicely; 2026-10-08: it lives in the World's top-left corner, today's date, weather and sound at the head of the Attention Center, with no button beside Fox, hidden inside an Applet, and a skeuomorphic book in the World's country style) holds them all, one page a day (`journalPages`). It is a book that opens over the World (`ui/companion/journal-book.ts`): a timber-leather cover with gold stitching and brass corners, two ivory leaves with a faint dot grid meeting at the spine, a moss ribbon, day tabs on the fore-edge and a pressed sage sprig, all drawn in CSS and SVG; the cards on it keep the artifact card's style. A day's cards stand in time order on the left leaf, then the right, two columns each: a large card takes two by two cells, a medium one two side by side, a small one a single cell, and later small cards fill the gaps; a narrow window shows one leaf. A card the person closes in the World (×, Escape or a click outside) flies into the Journal in the top-left corner on its way out. The day's plan opens its page and its summary closes it, even when the summary was caught up the next morning; a card stands on the day it was made. Attention cards and pages Fox made are small; an answer keeps its own size. Each card keeps the card as it was shown (owner request 2026-10-08: "journal 里保留卡片"): its origin, time, title, body, tone, picture and blocks on the card's own paper, smaller; a card never scrolls in its cell but shows the fullest version the cell holds, marked More when shortened ([Fits its card](#fits-its-card)); a day with more than the book holds scrolls inside its right leaf, never in pages. ‹ › at the page corners and the day tabs (Today, Yesterday, then dates) turn the pages. Opening one closes the book and shows it again in the World: an Attention card opens on its item, with its outcomes, while the item is in the World, and otherwise as it was, marked "earlier". × forgets it.

Pages Fox made are listed from their own records in their `page` rows of the person's own Applets ([one table](../applets/MY-APPLETS.md#one-table); `madeArtifacts`), which the phone also syncs, rather than copied into `artifacts`: one whose moment lasts, or that was kept, opens as its Applet; one whose moment is over shows **Keep and open**, which keeps it (the moment Applet's own Keep it) and opens it. Deleting one stays in its Applet.

Fox finds earlier artifacts with `list_artifacts` (target `artifact/list`: every word of the query matches the title or text, newest first) and shows one again with `open_artifact` (`artifact/open`).

At most 500 are kept per World; the oldest past that are forgotten. The practice world keeps none.

## The day's plan and summary

Each day Fox makes two artifacts without being asked (owner request 2026-10-06), the way it makes a meeting's summary: the World asks Fox once, and Fox reads the World with its own tools and model (local Codex sign-in, the person's API key, or a local Agent) and shows one large artifact, kept like any other.

- **Plan · Tue, Oct 6**, the morning brief (owner Order 2026-10-07: "早报我觉得不要等用户开始用才开始生成…早上六点一个定时的任务"): made at 6 AM local time by itself, before the person sits down, with the window hidden or an Applet open. A computer asleep at 6 makes it when it wakes, and Worldlet closed at 6 makes it when it opens, until noon; a day reached after noon gets no brief (a "Good morning" plan at 6:38 PM, owner Order 2026-10-07). It is made for someone who used Worldlet in the last three days, so an abandoned install spends nothing. Fox reads today's Calendar and due reminders, the open Attention items, yesterday's summary for what was left open, and, when the list asks what was done overnight, the World's history from 6 PM the evening before until now (`read_world_history`: what Agents, background work and routines finished, what arrived), and lays out on one card what kind of day it is and then each part the person asked for.
- **What the brief holds** is the person's own list, one part a line: *Morning brief* in the Journal's head shows and saves it, and Fox saves it when they ask ("早报加上 X 上的 AI 新闻", `set_worldlet_preference` `morning_brief`, only on the person's own words that turn). The default is only what was done overnight and today's schedule (owner Order 2026-10-08: "早报里面就说今天的安排就行了，昨天夜里做了什么、今天的安排"); the three things that matter most or reply drafts are a line the person adds.
- **Reply drafts**: when the list asks for mail, Fox reads the last two days of the inbox, picks the messages a person wrote that wait for an answer (at most five), and prepares a reply to each with `prepare_email`. A draft made by background work does not take the screen (`worldlet:email-drafted` instead of the email review): it is a card of its own on today's page of the Journal, medium and two rows tall, showing who it goes to and the whole draft. **Send** sends exactly that stored draft (a read-only Google connection, or a send that was tried and not confirmed, continues in Fox's email review, which asks for send access or checks delivery and never sends a second copy); **Edit** changes the words in place, saved as a new reviewed draft with the same headers while the old one is cancelled (`emailAction` `revise`); **Skip** drops it. Nothing is ever sent without the person's click, and a draft still waiting stays on today's page.
- **Summary · Tue, Oct 6**: from 9 PM. Fox reads that day's World history (`read_world_history` from midnight to midnight, paged to the end), its meeting summaries, the conversations with Fox and the items settled, and writes the day on one card: how it went, Done (the most important things by project or Applet, meetings and work with Fox included), Where the time went (approximate, from focused dwell, best as a chart) and Still open for tomorrow; the World keeps the full history. When Worldlet was closed before 9 PM, the summary is made at the first use of the next day, before that day's plan.

Rules (`core/artifacts/daily.ts`, wired in `ui/shell/notion-world.ts`):

- The person's own use counts: a message to Fox or an Applet they opened (`user_engaged`). The summary is made only for a day they used, the brief only for someone who used Worldlet in the last three days; an abandoned install and the practice world make nothing, so no model quota is spent.
- Each is made quietly (owner Order 2026-10-07): Fox's card does not open and Fox says nothing; Fox only looks busy while it works. The plan or summary is kept and opens no card: the Journal opens on its page instead (owner request 2026-10-08, "早上起来的早报，也是打开 journal 这一页"), for the person, not for an empty room (owner Order 2026-10-08: "早上起来的时候…直接把那个 journal 打开就是今天今早的第一页"): at once when they touched the computer in the last two minutes and are in the World, otherwise at their first pointer, key or screen wake that day once they are back in the World. Which day waits is kept with the daily state, so a restart in between still opens it; a day that ended unseen is dropped, and opening the book themselves counts as seen. It runs in a background session of its own in the Agent's task lane, beside the conversation (owner Order 2026-10-07: one conversation, agent work in a background thread that reports back): the person can talk to Fox meanwhile, its long request and tool steps never enter the conversation (the 10-06 summary had pushed it into a three-minute compaction), and one line of its result joins the conversation so Fox knows it was made. Fox's name tag shows it working. While other background work runs, it is asked again at the next poll.
- Fox's conversation keeps the person's side of the turn as its label (*Morning brief*, *Day summary*), never the long request in their name; the same holds for every request Worldlet writes for a button (`shown` in `contracts/fox.ts`, owner Order 2026-10-07).
- Each is asked once a day and marked made before Fox answers, so a failed turn is not retried all day. With no model, Fox offers *Choose a model* as for any request.
- Fox is asked only while the person is in the World: never over an Applet, an open card or dialog, onboarding or a turn in progress; it waits for the next moment. Automated browsers (the RC's UI checks) are never asked.
- Sources are untrusted; Fox sends, changes, joins and clicks nothing, and offers at most three next steps as actions.
- What was made when is kept per World in the page's storage.

## Storage

Local first. The `artifacts` table in `world.sqlite` holds each artifact's record (JSON) and when it was last shown ([World storage](../items/STORAGE.md)), so a World restored on another computer has them all. The host module is `platform/electron/src/modules/artifacts`; the page reaches it through the `artifacts` request (`list`, `get`, `save`, `delete`) and hears `worldlet:artifacts` when one changes.

## Checks

- `node scripts/artifacts-check.ts` (in `test:core`) checks the rules here: IDs, what Fox may show, the one-card budget, the steps a card fits through and the brief, default sizes, stored records, showing again, the World limit, days, finding, next steps, pages Fox made, and when the day's plan and summary are asked for.
- `node scripts/fox-artifact-size-check.ts` (in `test:ui`) checks the two desktop sizes, the default, the size control, the small card in an Applet's top-right corner, a narrow window and closing.
- `node scripts/artifact-fit-check.ts` (in `test:ui`) checks that a card never scrolls: the fullest version that fits, fewer blocks, then the brief, Show all, and fitting again when its room changes.
- `node scripts/artifacts-ui-check.ts` (in `test:ui`) checks keeping, Journal cards fitting their cells, next steps, the Journal (a page a day, sizes, the plan first and the summary last) with pages Fox made, opening again, Fox finding and opening one, and forgetting.
