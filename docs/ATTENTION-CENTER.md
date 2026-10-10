# Attention Center

The Attention Center surfaces what deserves the user's attention, with clear
source evidence and a useful next step. It is not a sync log or a copy of every inbox.

## Three kinds

| Section | Meaning |
| --- | --- |
| Coming Up | A source-grounded, confirmed time-bound commitment |
| Do Something | A concrete action or decision for the user |
| Worth Knowing | Relevant information or an unaccepted opportunity; not a commitment |

Empty sections stay empty. Loading, authorization and processing failures belong
in Applet/Fox status. A successful connection must not invent a task or FYI item.

## From sources to attention

Model-free collection commits bounded source observations. Applet analysis derives
private findings; Center synthesis reconciles cross-source context and proposes
items. Core validates evidence, revision, visibility and preserved user decisions
before publication. These stages do not share a single success checkpoint.

User-facing title, reason and summary are concise, model-authored and source-grounded.
Dates, source links and account identity come from trusted records. Exact quotations
help verify provenance but do not prove semantic correctness or usefulness.

## Identity and lifecycle

Separate obligations in one source need separate stable identities. A changed
wording or new reply must not resurrect a completed task. Different obligations
must not collapse merely because they share a thread or title.

Opening a preview acknowledges informational updates; viewing is not task completion.
Completion, dismissal and snooze retain their own meanings and survive restart.
Failed or partial collection cannot imply that missing obligations were resolved.
Cross-source items preserve each supporting source and its account/revision.

## Presentation and actions

The left HUD is vertically centered, content-sized and softly backed; it does not
shrink or reposition the world. Omit empty groups and remove whole overflow rows
rather than clip their content. Use one semantic marker per item.

The Center is a living focus set, not a queue or an inbox. It holds only what fits the
screen without paging, at most nine items, and need not be full. What it shows is decided
by importance and by fit with the moment: during weekday work hours work matters rank
higher; in the evening and on weekends personal ones do. Initial selection gives each
kind a place and admits worthy items up to the available space. A Center that starts
empty admits arriving results during its initial warm-up window. Settling an item
reduces the list; elapsed time, ordinary refresh and newly available space never
promote held-back items, including pressing rows previously trimmed by the screen.
New source evidence, a substantive state change or increased urgency can independently
admit an item. New pressing items join immediately. Snoozed members keep their place
and return when the saved timestamp expires.

### Ranking signals

Ranking combines several signals (owner decision, #1152): importance (an event's urgency or an
item's priority), fit with the moment, kind (an obligation before news), then deadlines and the
user's own mail workflow. A due date within 72 hours, or one overdue by up to 14 days, is a deadline. A Gmail
thread with any message kept in the inbox ranks higher, one whose messages are all archived
ranks lower, and an unread thread ranks a little higher. The workflow part spans less than one
obligation or deadline, so it reorders only comparable items. Archive alone is not evidence of
completion: it never hides a finding, and whether a matter is resolved stays an evidence-based
extraction decision. A source without observed labels has unknown placement, never archived.
The Gmail reader reports placement and unread state with each thread; they are kept on the
Attention fact outside its revision, so archiving or reading reorders a finding at once without
invalidating or re-analysing it. Weights live in `core/attention/attention-rank.ts`;
`scripts/attention-mail-rank-check.ts` is the controlled synthetic-mail evaluation.

### Timeliness

Every item says where it stands in time (owner decision 2026-10-04): its row and card show the
lead time (due, start or occurrence) in words, "Due in 2 days", "Overdue by 1 day", "Starts in
2 hr.", and, for mail, when the newest message of its thread arrived, "Received 3 days ago". The
receipt is the Gmail reader's own record time, kept on the Attention fact outside its revision like
the mail workflow; the model never writes it, and no extra model call computes any of these times.

Timeliness also sets the importance level an item ranks and takes a seat at. A task due within a
day, or overdue by up to three days, ranks at least as important (level 3), never as pressing.
Mail older than 14 days with nothing upcoming loses a level, older than 30 days two, and a due
date more than 14 days past loses one; they stay just above an item that is over. An event or
dated matter that has ended ranks last, takes no seat and is never urgent. Mail received within
two days ranks a little higher among comparable items. An upcoming due date or start keeps old
mail current. `scripts/attention-timeliness-check.ts` covers the labels and the order.

**Later** holds what is not for now (owner decision, 2026-09-30): the held-back backlog
and the items the person put off with a card's **Later**. The Center is two pages (owner
decision 2026-10-03, replacing Show all and Show now): **Now**, the screen-sized focus set it
shows day to day, and one screen below it **Later**. Scrolling or swiping the Center up turns
to Later, and the **Later** button at its foot (no count, owner decision 2026-10-04) jumps there; scrolling
down from Later's top, its **Now** button or a click on empty space beside the list comes
back (#1281). Later has a quieter title and lighter, smaller rows that still keep their own
category colours (blue, green, yellow) with a dashed rule, and it scrolls when it is longer
than the screen. A put-off row says when it comes back. Turning pages admits nothing into focus.
A row in Later opens its card like any other row, and a put-off item leaves
Later for its old place when its time comes. Membership and
held-item admission facts persist in local UI state; durable user decisions remain in
the ledger. A grouped card settles every represented member. The authored sample keeps
its full list.

Selecting an item opens a brief with grounded context. The card's ruled action bar holds
the user's own controls: one filled outcome (Done for a task, Got it for an event or
update) plus outlined Dismiss and one-click Later; settling it moves straight to the next item.
Dismiss only closes the card: the item stays in the Center, unsettled (owner decision).
Removing an item without an outcome is Remove in Fox's options for the item inside its Applet.
Fox's options are what Fox says and the replies to it, drawn as bold underlined words, never
as item controls; choosing one shows as the person's reply (a reply mark and its name). Opening its original is an
explicit next step.

Results arrive prepared (owner decision 2026-10-09): for a new Worth Doing item from a Gmail
thread that waits for the person's reply, Fox prepares a reply in the background without being
asked, a reply card in today's Journal that only the person sends. While a draft for the item's
thread waits, its card carries one quiet line, "Fox drafted a reply · Review", which opens the
Journal on the draft. Which items qualify and how many is in
[replies Fox prepares](../core/artifacts/README.md#replies-fox-prepares). Fox provides contextual help and authorized actions; content
text itself cannot grant execution rights. Keep reading and external writes distinct.

## Acceptance

Use real sources to assess relevance, distinct obligations, correct originals,
no repeated nagging and state after restart. Test interruption between each pipeline
stage. Fixtures and sample data do not establish production usefulness.

[Implementation and unresolved cases](../core/attention/README.md) owns schemas,
coverage policies and targeted acceptance. [Runtime](APPLET-RUNTIME.md) owns scheduling;
[interaction design](DESIGN.md) owns the shared HUD.

## Brief card composition

The header groups title and structured time/location in its left column. The picture is the whole card's background, showing most on the right (owner Order 2026-10-08): a paper scrim fades it out from the right edge toward the heading and down over the summary and footer, so every word keeps the card's own contrast. When the email behind the item has its own picture, that picture takes the illustration's place ([email pictures](../core/attention/README.md#email-pictures)). The model is prompted for one introductory sentence and two or three supported key points, emphasizing important phrases in bold (the same color as body text). Bold renders even right against Chinese text or punctuation (`**时间：**10月5日`), where CommonMark would leave the asterisks literal (owner report 2026-10-04): the card, Fox's replies and the phone cards share that rule ([ui/components/markdown.ts](../ui/components/markdown.ts), iOS `strongSegments`), and the card renders only inline formatting, lists and safe links, never HTML (`scripts/attention-brief-markdown-check.ts`). Existing saved prose is retained until model processing updates it. The summary expands the short reason into what happened, related messages, why it matters and the next useful step when supported, without repeating the title. Source information sits on the left of the footer, with the primary outcome, Dismiss and Later at the far right; narrow cards wrap the groups. Later saves a 24-hour deferral immediately (the explicit next-day assumption in the absence of a default setting). Shared UI owns composition and masking; shared tool guidance owns the brief format.
