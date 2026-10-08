# Google Drive

Native recent-file list and Google Docs text; Web for original layouts and editing.

## Runtime

- Stable identity: `app-google-drive`; provider: `google-drive`.
- Executable configuration: [runtime.json](runtime.json).
- Mode: **on-demand**.
- Optional existing `drive.readonly` OAuth grant, separate from Mail/Calendar onboarding.
- Open lists 20 recent files per cursor page. Focus exports Google Docs to complete plain text (up to 2 MiB); PDF, images, folders and other formats show metadata with an explicit Web notice.
- Respect `capabilities.canDownload`. No file writes, arbitrary downloads or automatic background publication.
- Source IDs and account revisions cross the shared curated-reader boundary. Mac capability only; other hosts do not advertise this reader yet.

## Status

Fixture-verified; real OAuth/account acceptance remains pending. Google client verification still applies to external users.

See [integration status](../../../core/applets/INTEGRATIONS.md) and [runtime](../../../core/applets/RUNTIME.md).
