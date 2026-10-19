# Google Drive

The Applet opens the original Google Drive website for browsing and editing. The saved-content reader can read recent files and Google Docs text.

## Website presentation

Opening this Applet loads its original website in Worldlet's isolated browser surface. The Village theme supplies only the backdrop and measured page rectangle; the site's own interface handles editing, navigation and account sign-in. Existing authorized data readers remain available to Fox and Attention; opening the site does not grant them new access.

## Runtime

- Stable identity: `app-google-drive`; provider: `google-drive`.
- Executable configuration: [runtime.json](runtime.json).
- Mode: **on-demand**.
- Optional existing `drive.readonly` OAuth grant, separate from Mail/Calendar onboarding.
- The saved-content reader lists 20 recent files per cursor page. Its detail reader exports Google Docs to complete plain text (up to 2 MiB); PDF, images, folders and other formats show metadata with an explicit Web notice.
- Respect `capabilities.canDownload`. No file writes, arbitrary downloads or automatic background publication.
- Source IDs and account revisions cross the shared curated-reader boundary. Source reads use the host capability boundary; opening the website does not require it.

## Status

Fixture-verified; real OAuth/account acceptance remains pending. Google client verification still applies to external users.

See [integration status](../../../context/applets/INTEGRATIONS.md) and [runtime](../../../context/applets/RUNTIME.md).
