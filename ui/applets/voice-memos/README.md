# Voice Memos

Read and listen to local recordings from Apple Voice Memos without leaving Worldlet.

| State | Behavior |
| --- | --- |
| Peek | Painted recording desk in Library: microphone, waveform display and archive tray. The picture does not claim live recording or an unread count. |
| Open | Four selectable recording cards per page; up to 200 audio files from an explicitly selected folder. Fox offers Choose/Change folder, Refresh and Disconnect. |
| Focus | Local audio position and optional supplied transcript at left; selected recording card, parent device and Fox at right. Fox offers Play/Pause and Start over. Adjacent-item arrows retain the same reader. Leaving Focus or reloading the world stops playback. |

## Connect

Connect Voice Memos through Fox to opt in to read-only access to `CloudRecordings.db` in Apple's local Voice Memos group container. The adapter probes the schema, excludes deleted entries where that field exists, validates paths and lists up to 200 recent entries with readable, downloaded media. Apple/iCloud handles synchronization; Worldlet does not download missing recordings. Names and dates come from the database. This is an undocumented format, not a public Apple API; incompatible schemas fail with a visible error.

If macOS denies access, Fox's Allow access action opens Privacy & Security → Full Disk Access. The user must enable Worldlet and quit/reopen it, then choose Connect Voice Memos again. Worldlet cannot grant itself permission. Disconnect removes Worldlet's connection, not the system permission; revoke that separately in Settings.

Existing `tsrp` transcript metadata is read from bounded media boxes without re-transcription. Missing or unrecognized transcripts are shown as unavailable. No audio is uploaded. Asking Fox about visible text uses the normal context/model consent flow.

Choose recordings remains a fallback for exported audio folders, remembered by path in the World store (folders chosen with the retired Swift host's security-scoped bookmark must be chosen again). M4A, MP3, WAV, AAC, CAF, AIF and AIFF are accepted; a file plays when Chromium in the host's media surface can decode it (`platform/electron/src/modules/media/voice-memos.ts`). Files above 512 MB and paths outside the selected root are rejected. Folder listing excludes hidden files, packages and symlinks. A matching UTF-8 `.txt` (up to 128 KB) is optional for exports.

Implementation references: [Swift CLI](https://github.com/harryf/voice-memos) and [local export adapter](https://github.com/polarity-dev/macos-voice-memos-export). Database and media parsing are implemented locally; no external CLI installation is needed.

Sample contains a clearly fictional text record, with no personal audio and no simulated successful playback. Disconnect forgets the folder connection and stops playback; it never deletes the user's files.

## Identity and art

The title identity icon is extracted unchanged from Apple's installed `/System/Applications/VoiceMemos.app/Contents/Resources/VoiceMemosApp.icns` using `sips` PNG conversion. `logo-source.ts` embeds those original pixels. The painted device is an interpretation of function and waveform identity, not an official Apple logo. Asset/prompt provenance: [device](../../../resources/styles/builtin/assets/applets/voice-memos/README.md).

## Acceptance

- `scripts/voice-memos-check.ts`: mocked host bridge; Open pagination, Focus, Fox playback controls, next-item selection, navigation cleanup, disconnect and no cloud/browser calls.
- The retired Swift host's `--voice-memos-check` (disposable silent audio: path traversal, symlink exclusion, duration decoding, optional text, player start/pause/stop, Sample isolation) is not yet ported to Electron.
- Real Voice Memos library access and Full Disk Access still require user-device acceptance. No real-account access is claimed by these fixtures.

### Permission setup

“Open permission settings” opens Full Disk Access and reveals the running app bundle in Finder. Fox explains how to drag that selected app into the permission list and enable access, including that this grants access to protected local files. It never grants permission automatically or asks users to locate a developer path. Returning to the app triggers one connection retry; further activations do not repeat it. If access is still inactive, “Restart Worldlet” reopens this same bundle, returns to Voice Memos, and retries once. Users can instead choose a folder of exported recordings without granting Full Disk Access.

Validation: the offline Voice Memos UI fixture covers return/retry, restart-button visibility, folder import, playback and disconnect. Actual macOS permission changes require user approval; the fixture does not claim to validate a real grant.

A 26 Sep 2026 recheck on the retired Swift host also covered empty export folders, missing-library/download guidance, cloud-only rows, absent transcripts, transcript symlinks outside the selected folder, and disconnect preserving the original audio; it has not been repeated on Electron. Real Full Disk Access (granted to the Electron app bundle), iCloud download behavior and rendered UI navigation are not validated.
