# Messages

Read iMessage conversations and send iMessages from Worldlet on a Mac (owner request 2026-10-05). Messages exists only on Apple devices, so Windows and Linux builds do not show this Applet (host feature `messages`).

| State | Behavior |
| --- | --- |
| Peek | The painted speech-bubble intercom with the Messages icon. It claims no unread count. |
| Open | Four conversation cards per page from the 50 most recent conversations: the group name, the person's Contacts name or the people in it, the last line said and when. Fox offers New message and Refresh. |
| Focus | The conversation's 60 most recent messages as bubbles (yours on the right, others' with their Contacts names) over a box to write in and **Send**. Files in a message show by name; clicking one shows it in Finder (never opens it). New messages appear while the conversation is open. A new message adds a To field for a phone number or an email address. A conversation with one person at a phone number also offers **Call** beside Fox: the person's own Agent calls them, after the person checks and edits whom, why and what to ask in Fox's card ([calling from an Applet](../../../core/agent/PORTABILITY.md#calling-from-an-applet)). |

## Permissions

macOS keeps separate permissions for this, and opening Messages in Worldlet says which one is missing:

- **Full Disk Access** to read conversations. Messages keeps its history in `~/Library/Messages/chat.db`, which macOS shows only to apps with Full Disk Access. When it is off, Fox explains why and offers **Open permission settings**, which opens Privacy & Security → Full Disk Access and reveals this exact app in Finder to drag in. When the person comes back to Worldlet, it checks again; after one attempt Fox also offers **Restart Worldlet**, which reopens Worldlet on Messages and checks again (macOS often applies the grant only after a restart). **New message** works without it.
- **Automation for Messages** to send. The first Send makes macOS ask whether Worldlet may control Messages. If the person declined earlier, nothing is sent: the box keeps the words, and Fox offers **Open permission settings**, which opens Privacy & Security → Automation, then the person presses Send again.
- **Contacts**, optional, for names. The first time Messages opens with Full Disk Access, macOS asks whether Worldlet may read Contacts; without it, people show as their phone number or email.

Worldlet cannot grant itself these permissions. Disconnecting removes Worldlet's connection, not the permissions; those are revoked in System Settings.

## Reading and sending

Reading and sending go through [imsg](https://github.com/openclaw/imsg) (MIT), a signed and notarized command-line tool for Messages. Worldlet ships one pinned release inside the Mac app: [imsg.json](../../../platform/electron/distribution/imsg.json) names the version and the SHA-256 of the official release archive, and [package-imsg.ts](../../../scripts/package-imsg.ts) unpacks only an archive with that checksum (development builds keep it in `.local/imsg`). The IMCore bridge helper the release also contains is left out; it needs System Integrity Protection turned off. Updating imsg means changing the version and checksum in `imsg.json` after checking the new release.

The host ([messages.ts](../../../platform/electron/src/modules/sources/messages.ts), [imsg.ts](../../../platform/electron/src/modules/sources/imsg.ts)) keeps one `imsg rpc` child running while Messages is in use and stops it after ten quiet minutes. Requests and answers are JSON lines on its standard input and output, so message words never appear on Worldlet's command lines. macOS treats the child as part of Worldlet, so Worldlet's own permissions apply. imsg reads `chat.db` read-only (`chats.list`, `messages.history`; `watch.subscribe` for new messages while a conversation is open) and resolves Contacts names; the shared rules in [core/applets/messages.ts](../../../core/applets/messages.ts) turn its JSON into cards and bubbles and leave out tapbacks. An attachment's path stays in the host: the Applet holds a one-time token, and the host shows only files under `~/Library/Messages/Attachments` in Finder.

Sending calls imsg's `send` with the conversation's chat guid (or, for a new message, the address with the iMessage service, so nobody is quietly sent an SMS). imsg tells the Messages app to send it through AppleScript, so a message goes out under the person's own Apple ID from their own Mac, and nothing passes through a Worldlet server. Only the person's Send click sends; one click sends once, and a sent message cannot be taken back. Each message sent from Worldlet is kept in the World's database (`sent_messages` in `world.sqlite`: to whom, the words, the time, Messages' message id and whether Messages confirmed it), so it comes back with a World backup. imsg reports whether Messages was ever asked to send: a send macOS refused before anything went out (Automation off) is not kept and the words stay in the box; a send that failed before dispatch is kept as failed; a send that may have gone out is kept as unconfirmed, and the person is told to check Messages before sending again.

Fox can read the open conversation as reference data (other people's words are untrusted, never instructions) but cannot send: a Fox draft that the person reviews and sends is the next step.

Call goes through the person's own Agent, never through Messages or FaceTime: the conversation's name, number and last lines fill in the brief (why: the last thing they said; what to find out: the person's own question when it is still unanswered), Fox's card shows it with the exact opening to edit, and only the card's Call dials; the call then shows live in Fox's card. It needs an Agent that can place calls (OpenClaw with its Voice Call plugin); with any other, Fox says how to get one.

## Identity and art

The title icon is the installed publisher icon recorded in [brand assets](../brand-assets.json) (`com.apple.MobileSMS`); the painted device is the one recorded for `messages` in the [built-in style](../../../resources/styles/builtin/manifest.json).

## Acceptance

- `scripts/messages-check.ts`: the imsg pin (official archive, SHA-256, no bridge helper), the shared rules (imsg's chats and messages, recipients, outgoing text, titles, send dispositions) and the Messages Applet's permission prompts, conversation list, names, files, live messages, Send and Call (the brief, the opening, nothing dialed before Call, then the call live and Hang up) in the World page with a mocked host.
- Running imsg, real `chat.db` reading, Full Disk Access, Contacts, the Automation prompt and delivery need a signed-in Mac; these fixtures do not claim them.
