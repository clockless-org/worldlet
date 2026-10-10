# Card system

Every artifact is drawn in one design system, the Attention card's (owner Orders 2026-10-08: "artifact一定一定一定要统一设计system，attention card就是我们标准的design system" and "你要做一套 design system，比较丰富的，用来渲染这个 artifact"). An Attention card, an answer Fox shows, a meeting's summary, the day's plan and a card in the Journal are all made of the parts below, and nothing on an artifact brings a look of its own. Fox chooses parts and fills them with words and numbers; Worldlet draws them. Fox never writes HTML or styles.

The card is defined in [artifact-card.css](artifact-card.css) (in the World, on the Attention card's parts in [attention-preview.css](../attention/attention-preview.css)) and [journal.css](journal.css) (the Journal's smaller version). The parts are drawn by [artifact-blocks.ts](artifact-blocks.ts) and [fox-artifact.ts](fox-artifact.ts). The rules for what Fox may send are in [core/artifacts](../../core/artifacts/README.md#blocks).

## Foundations

**Paper and ink.** Every card has the HUD paper (`--ui-paper` with `--hud-paper-art`) and the paper ink (`--hud-paper-ink`). Muted text uses the same ink at lower opacity, never a new grey.

**Tones.** A tone is the card's accent (`--attention-accent`). It colours the labels, rules, figures, step marks, chips and buttons. Each tone stands for one kind of thing, so a card's colour tells the person what it is about:

| Tone | Accent | Used for |
| --- | --- | --- |
| moss | `#315f48` | Answers in general (the default) |
| teal | `#28718a` | Times, events and travel (the Attention card's Coming Up) |
| honey | `#946e2b` | Things to do or decide (Worth Doing) |
| sage | `#557955` | News, updates and learning (Worth Knowing) |
| clay | `#a04e33` | Costs, risks and warnings |
| plum | `#6c4a78` | People and plans with others |

A card sets its tone (`data-tone`), and a callout block can carry a different tone. Each tone has two derived colours: a wash (8% of the accent), used behind tiles and callouts, and a line (30%), used for borders. A neutral rule (`#38564420`) separates rows.

**Type.** Inter (`--ui-font-ui`) at four sizes, all from the UI foundations:

| Role | Size and weight | Example |
| --- | --- | --- |
| Title | 28px / 600 (`--ui-text-title`) | The card's name |
| Label | 14px / 600, uppercase, accent (`--ui-text-label`) | A block's label, the card's origin |
| Body | 16px / 400 | Markdown, fact rows, step titles (600) |
| Figure | 26px / 600, accent, tabular | A stat's value |

Small text (notes, step details) is 13–14px. Any Markdown heading reads as a label.

**Shape.** The card's corners are slightly uneven (16/18/17/19px), like paper. Tiles, options and callouts use 12px corners. Chips and the recommended badge are pills. Step marks are 24px circles. Buttons are the Attention card's outline and filled buttons, 9px corners.

**Pictures.** An answer has the Attention card's painted scenes (100 of them, from [scenes](../../resources/styles/builtin/assets/attention/scenes.json)). The picture fills a band across the head of the card, strongest on the right and fading into the paper toward the title and the body. Fox can name a scene (`art: "flight"`), ask for none (`"none"`), or leave it to the card, which picks the scene whose keywords match the title and body, and otherwise the general picture for its tone. A card in an Applet's corner shows no picture; a card in the Journal keeps its picture, smaller.

**Icons.** The UI's line icons (1.8 stroke): clock for time, map for a place, coins for cost, people for a person, link for a link, note for a note.

## Parts

A card is a head (origin label, title, picture), a short Markdown body, up to three blocks, and up to three next steps.

| Block | What it is for | How it is drawn |
| --- | --- | --- |
| `callout` | The one line that matters most | The tone's wash with a 3px accent rule on the left |
| `stats` | Two to four headline figures | Tiles with the figure in the accent, a label and an optional note |
| `facts` | Time, place, cost, people, links | Icon rows, like the Attention card's time and venue lines |
| `steps` | An order of things | Numbered accent circles on a thread, with the time on the right |
| `compare` | Two or three options | Side-by-side columns; the recommended one is outlined in the accent with a Recommended badge |
| `tags` | Short labels | Pill chips on the wash |
| `checklist` | Things to tick | Ruled rows with accent check marks and a count |
| `scale` | Amounts that follow a count | − and + around the count, and a ruled table of amounts |
| `choice` | Two to four answers | Outline buttons that draft the request |
| `parts` | A whole made of named parts | Outline buttons, with the chosen one filled, and its detail below |

The last four are the parts the person works with ([Blocks](../../core/artifacts/README.md#blocks)). Blocks count toward the one-card budget, so a card with several stays one card.

## In the Journal

A Journal card keeps the card as it was shown (owner request 2026-10-08: "journal 里保留卡片"), only smaller. It keeps the World card's paper and corners, its tone, its painted picture across the head, and every part: figures stay in the accent with their notes, steps keep their marks and details, and the recommended option stays outlined with its points. Its blocks are drawn at 11–15px. It never scrolls (owner Order 2026-10-09): it shows the fullest version its cell holds, down to the one-sentence brief, and says More when it left something out ([Fits its card](../../core/artifacts/README.md#fits-its-card)).
