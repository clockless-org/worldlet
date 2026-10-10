# Applets and artifacts

The person's World has two kinds of thing (owner decision 2026-10-06: "最后就两个概念，一个是Applet，一个是Artifact。然后artifact可以变成持久的applet"):

| | What it is | Where the person finds it |
| --- | --- | --- |
| **Artifact** | Something Fox shows: an Attention card, a table or plan from a conversation, a page Fox made. Shown for now. | The Journal page of Fox's panel ([Artifacts](../artifacts/README.md)) |
| **Applet** | A place the person goes back to | Its device in the World, its tile in the phone's Applet world |

An Applet is either **built in** (the [catalog](catalog.ts): Gmail, Calendar, the Browser, games) or **the person's own**. No other word for a kind of Applet reaches the person: "moment Applet", "ongoing thing", "site Applet" and "widget" are names in code only.

## The person's own Applets

| Kind (`mine`) | Made from | How |
| --- | --- | --- |
| `site` | A website | **Make Applet** at the top of the Browser ([site-applet.ts](site-applet.ts)), or asking Fox ("把这个网站做成 Applet": `make_applet` with `website`, added at once) |
| `page` | A page Fox made, or any card from the conversation | Asking Fox ("make me a packing list for Tahoe"): the person's own Applet while its moment lasts, and **Keep it** keeps it ([made pages](../widgets/README.md)). Or **★ Keep as Applet** on a card Fox laid out in conversation: the card becomes a kept page Applet at once (below) |
| `conversation` | A conversation brought from another Agent | Fox proposes it; the person's yes makes it one ([ongoing](../ongoing/README.md)) |

Each is placed in the World beside the catalog's Applets (`world.dynamicApplets`, built in `ui/world/world-projection.ts`) and carries `mine` with its kind (`myAppletKind`, `isMyApplet`). Everything stays local: nothing about them goes to a server, and a World backup carries them all.

## One table

All of them are rows of one table in `world.sqlite`, `my_applets` (owner decision 2026-10-06): `id` (`site-…`, `wgt-…` or `job-…`), `kind`, the `record` (JSON), a page's `html` and `state` (what was ticked), and the `icon`, `background` and `painted_at` of its [pictures](#pictures). A `conversation` row also holds Fox's proposals until the person keeps or declines them. Deleting an Applet deletes its row, its pictures with it. The host reads and writes it through `WorldLedger` (`myApplets`, `saveMyApplet`, `deleteMyApplets`, `myAppletPage`, `myAppletIcons`, `myAppletArt`, `saveMyAppletArt`); the pages' and conversations' own modules keep their names for it (`widgetRows`, `ongoingRows`, …).

Until 2026-10-06 they lived in four places: the `widgets` and `ongoing` tables and the `site-applets` and `applet-art` ledger buckets. The first time a World opens with this version they move in, once (the `world_settings` key `my-applets-moved` records it), and the old places stay as they were for a month in case a World is opened by an older version; a later version removes them.

## Keeping an artifact

Set aside since 2026-10-07 (owner request: not on the card; if it comes back, the button stands beside Fox): the cards Fox lays out in conversation no longer show **★ Keep as Applet**. The host request remains: it keeps the card as one of the person's own page Applets, with no end, and opens it in the World; the artifact itself stays in its list. The World page sends the card's body as it renders it (Markdown and the chart Fox verified); the host turns it into one self-contained page (`artifactPage` in [artifact-page.ts](../widgets/artifact-page.ts)) that keeps only plain reading markup (no scripts, links, pictures, frames, forms or handlers, and addresses lose their scheme), checks it by the same offline rules as any page Fox makes, and saves it as a made Applet (the `widgets` request `keepArtifact`). Keeping the same card again opens the Applet it already became. Attention cards have no such button: their World item stays the truth.

## Data and page

A page Applet keeps what it shows apart from how it shows it (owner request 2026-10-06: "Applet自己里面可能有数据…最后都是用HTML来展现"):

| Part | What it is | Who writes it |
| --- | --- | --- |
| Page | One self-contained HTML page | Fox's model when making or changing the Applet (`save_applet`) |
| Data | One JSON object or array, at most 40 KB (`WIDGET_LIMITS.dataBytes`), in the Applet's record | Fox, with `save_applet`'s `data` or later with `update_applet_data` (`moments/data`) |
| State | What the person ticks or types (its `localStorage`) | The person, merged between computer and phone ([state and sync](../widgets/README.md#state-and-sync)) |

The page reads its data as `window.worldlet.data` (null when it has none). The host writes the data in a script of its own just after Worldlet's prelude and before the page's code (`widgetWithData`), on the computer and in the page the phone receives, so the phones need nothing new. `save_applet` asks the model to put whatever may change (events, items, prices, numbers) in data and draw it from there, so Fox can keep the Applet current without rewriting it: when the person asks ("把今天的日程更新一下"), or in a routine they set up ("每天早上更新"), Fox reads the current data (`read_applet_data`, `moments/read`), gathers what it needs with its own tools and sends the whole new data. The page loads again with it, keeping what was ticked; its version rises so the phone takes the new page. The page stays sandboxed: it sees only the data Fox gave it, never the World.

## Pictures

Each of the person's own Applets gets an icon and a background painted for it (owner request 2026-10-06: "可以用本地ImageGen的模型去生成这个Icon的图片，包括背景图"), by the image model they already have on this computer: Codex's image generation, through their own Codex sign-in or OpenAI key. Worldlet pays for no picture and sends nothing to a painter of its own. Without Codex signed in, nothing is painted: a website keeps its site's icon and the others keep their painted device.

- **When.** After each World update, the World page names the person's own Applets to the host (the `appletArt` request `ensure`). The host paints those with no pictures one at a time, at most 12 a day; one that failed is tried again a day later. **Paint new pictures** in a device's menu forgets the old ones and paints that Applet next (`repaint`).
- **How.** The host runs `codex exec` in an empty folder of its own and asks, through Codex's `$imagegen` skill, for `icon.png` (square) and `background.png` (wide), in Worldlet's storybook village style with no words or logos (`codexArtTask` in [applet-art.ts](applet-art.ts)). Only the Applet's name, what it is for and its kind go into the words, never page or mail text. When Codex keeps the pictures only in its own `generated_images` folder, the host takes the newest of the right shape from there. The icon is kept as a 256-pixel PNG and the background as a JPEG 1600 pixels wide, both in the Applet's row of [`my_applets`](#one-table); failed attempts are kept in the `applet-art-attempts` bucket.
- **Where they show.** The icon rides in the snapshot (`appletArt`) and stands over the Applet's device in a cream frame, as a website's own icon did; a painted one takes its place. A page or conversation Applet's panel sits on its background under a cream wash; a website Applet shows the site itself.

## Their mark

The person's own Applets carry a small mark so they read as theirs at a glance (owner request 2026-10-06: "要有稍微有个小的角标…这是我的自己的Applet"): a honey disc with a cream five-point star at the device's lower right (`ui/theme-packages/village/my-applet-mark.ts`), sized to the device. Hovering the device shows its name followed by the same star and "Yours". The World's scene metrics report each device's `mine`. The phone's Applet world carries the same mark on their tiles: each Applet the computer sends says where it came from (`mine` in `PhoneApplet`, core/phone/payloads.ts), and the iPhone and Android tiles draw the honey star at their lower right and read "Yours" to screen readers.
