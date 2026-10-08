# Native Mail

Focus is built with the shared `appletSurface` primitive, not a separate Mail
card system. The Village HUD owns paper/forest materials, heading typography,
corner decoration, borders and spacing. Mail supplies only message anatomy.

The original subject is the fixed header. Sender, address, To/Cc and received
time sit above the original in one bounded scrolling body. A portrait stamp
shows the sender's public picture, read by the host (`mailAvatar`, rules in
`core/applets/mail-avatar.ts`): their Gravatar, else the organization's BIMI logo
or website icon (never for personal mail domains), else their initials on a
fixed muted tint. Images arrive as data: URLs and stay in memory for the app
session; the practice world and fixture domains never look one up. Previous/next email
controls occupy a reserved slot at the right of the reader header, clear of
the subject and the upper-left Back control. Task
actions stay with Fox. The shared Focus shell owns the device and navigation.

Sample and live originals use the same renderer. Header values are text, never
HTML; the body uses the existing sanitized Markdown renderer. The reader text is
the sender's HTML part converted to Markdown (headings, lists, emphasis, quotes,
labelled links; hidden preheaders, layout tables and tracking pixels dropped),
and the plain part only when there is no HTML (`harness/hermes/gmail_reader.py`).
Reflow preserves wording, paragraphs, links, tables and attachment metadata,
removes invisible padding, shows a long bare URL as its site, and folds a quoted
earlier message behind Show quoted text. Text is set in one measured column. Fox summaries do not
replace originals. Earlier thread messages can be expanded individually; only
explicit source thread IDs group messages.

The native adapter supplies Gmail headers and MIME attachment names/sizes when
available. Attachments are read-only metadata, not download buttons. The
sender's own HTML styling, remote images, CID images and attachment previews are
not shown here; only an Attention card may show one picture from the email
([email pictures](../../../core/attention/README.md#email-pictures)). Missing dates remain explicitly unavailable. No contact lookup or
invented profile picture is used.

Open retains its village attention pinboard: up to nine attention-bearing
threads, with concise titles, source sender and date. Other mail remains
available through Web. Saved drafts remain accessible through Fox, without a permanent board button. This UI
does not modify messages or connection permissions.

Focused checks: `node scripts/mail-avatar-check.ts` covers portrait sources and
reading rules without a browser; `node scripts/mail-focus-check.ts` exercises original reading,
safe metadata, attachments and compact layout; `node
scripts/text-reader-hud-check.ts` verifies the live bundled day/night HUD and
equal Focus gutters with fictional records. These are not real-account tests.

Mail uses a static sage mailbox on a broad, low timber pedestal. The shared device stays still in Peek, Open and Focus; no mailbox sprite-frame animation is registered. Content transitions and attention indicators remain separate from device motion.
