# Google OAuth verification

## Current review and requested scopes

The owner supplied verification-team replies dated September 25 and 28, 2026.
The review is awaiting stronger scope justification and an end-to-end demo, not
approved. The Console Data Access configuration has been updated to the owned-calendar
scope below, with the three existing identity scopes explicitly listed and the
Calendar justification corrected. The Console confirmed that saving updates the
pending verification request; the prior demo URL is unchanged and needs replacing.
Keep its publishing status In production as requested by the reviewer;
that status is not scope approval. Test changed scopes in a controlled staging
build before exposing them to production users.

| Scope | User-facing purpose | Implementation boundary |
| --- | --- | --- |
| `openid`, `userinfo.email`, `userinfo.profile` | Identify and display the connected account | Identity only |
| `gmail.readonly` | Display email bodies and threads; derive source-backed findings | Bounded, paginated reads |
| `calendar.events.owned.readonly` | Display upcoming events and original event details | Primary calendar only; default next 30 days, 20 events per page |
| `gmail.send` (optional) | Send a reply the person reviewed and confirmed | Requested only when the person asks to send; never in the core grant |
| `drive.readonly` (optional) | List Drive files with their links | Requested only from the Drive entry; automatic collection reads metadata, not file bodies |

The active direct OAuth path requests Mail and Calendar read access together.
Drive is optional and is not implicitly requested. Sending uses a separate
user-requested `gmail.send` upgrade and reviewed Send confirmation. Do not describe
the entire product as incapable of sending, or include an unsubmitted sending
flow in the read-only demo. Match the actual submitted build, consent screen,
Console Data Access list and verification request, including identity scopes.

## Calendar least privilege

The reader calls `events.list` and `events.get` with `calendarId="primary"`.
Google documents `calendar.events.owned.readonly` for both methods. This reads
content in calendars the user owns, without read access to other people's shared
calendars. Ownership is of the calendar, not of each event's organizer. An invited
meeting on the user's primary calendar is a required real-account test case.

The former claim that no narrower read-only scope exists was incorrect. The
active Python, Mac and Windows scope declarations now request owned-calendar
access. The experimental remote MCP configuration in `google_mcp.py` is disabled
and retains separate tool/scoping requirements; it is not this reader or the
submitted authorization route. Do not enable it as a fallback or claim it covered
by this submission.

### Existing authorization

Changing code or the Console does not revoke an existing Google grant. On an
explicit reconnect, the direct Python path requires the new scope and the Windows
path requests it. Both request builders omit the retired
`calendar.events.readonly` scope when carrying prior grants into new consent.
Cancellation or incomplete consent must preserve existing credentials. Existing
broad grants may remain usable until reconnection; do not silently revoke the
project-wide grant, overwrite its recorded scopes, or claim it has been narrowed.

For recording and acceptance, use a clean test grant. Merely disconnecting
Worldlet deletes local credentials but does not revoke Google's grant across
installations. If revocation is needed, the account owner must deliberately remove
the connection in Google Account settings; this can affect other devices.

## Scope justification

**Gmail:** Worldlet displays message bodies and threads and uses source content to
identify actionable information. `gmail.metadata` cannot return message bodies,
so it cannot support the in-app full-message reader. Show the body and resulting
user-facing feature, rather than only subjects or connection status.

**Calendar:** Worldlet reads the user's primary calendar with
`calendar.events.owned.readonly` to display event titles, start/end times,
attendees and event details. Free/busy access does not provide those details.
Worldlet does not need to read calendars owned by other people for this feature,
and does not create, edit or delete Google Calendar events through this reader.

Tokens and saved records remain in the local profile. Relevant private content can
be processed by the configured cloud model under the application's consent and
privacy disclosures. Do not claim exclusively on-device processing. Disconnecting
a source does not erase saved items; deleting local Mail data does not delete
messages from Gmail. Gmail restricted-scope data handling and any required
security assessment remain separate from approval of the demo video.

## Submission checklist

1. Verify the new scope using a fresh test grant: primary-calendar list, exact
   event lookup, invitation from another organizer, recurring event, cancellation
   and failed-consent preservation. Fixture results are not real-account acceptance.
2. Replace `calendar.events.readonly` with `calendar.events.owned.readonly` in the
   Console submission and Data Access configuration. Reconcile identity and all
   other requested scopes against the actual app. Do not add unrelated permissions.
3. Record the actual system-browser OAuth flow in English. Expand requested
   permissions so their text is readable. Re-record consent after changing scopes.
4. Show the same email in Gmail and Worldlet, including body content and its use.
   Show the same primary-calendar event in Google Calendar and Worldlet, with
   readable details and its use. Use a dedicated account with fictional content.
5. Show connection and local-data controls accurately. If any submitted feature
   writes to Google, separately show the result in the source account.
6. Upload an accessible demo and reply to the existing verification email thread
   with its link, timestamps and the scope change. Do not submit a placeholder link.

Remaining acceptance: fresh Google-account verification in the desktop app on Mac
and Windows, a new consent recording and source-account comparison
footage. This change does not publish an installer or complete Google verification.

## CASA data flows and local credentials

CASA readiness self-check: #1677. This section is the assessment's data-flow
inventory for the shipped desktop build; keep it and the
privacy policy in step with the code. It is
readiness evidence, not a lab result. The CASA lab confirms the specification
version and component scope.

| Data | From → to | Protection and retention |
| --- | --- | --- |
| Google token, client file, account profile | Google OAuth → this computer's Hermes profile (`google_token.json`, `google_client_secret.json`, `google_profile.json`) | Never leaves the computer; no Worldlet account or server custody. Written owner-only (0600) from the first byte and atomically replaced ([`write_private`](google_direct.py)); older or copied files are tightened before Hermes refreshes them in place. On Windows the same files get a protected owner-only ACL (the user, SYSTEM and Administrators; nothing inherited). Verified on a Windows device on 2026-10-05: the profile folder inherited read access for the local Codex sandbox group, and a file written or tightened by this code dropped it. Disconnect deletes these files without revoking other installations' grants |
| Gmail, Calendar, Drive content | Google APIs → this computer directly | Saved in the local World ledger until deleted; source deletion removes every stored revision |
| Source content in model requests | This computer → the person's own Codex sign-in, API-key provider or local Agent (Worldlet runs no model service since 2026-10-05) | Only after private-content processing is allowed. Nothing passes through a Worldlet server |
| Fox's recorded activity (execution journal) | Local only (`execution/*.json`, owner-only files) | Credentials are redacted before writing, both as structured keys and as text such as `refresh_token=…` or Python dicts ([`journalPayload`](../../core/items/execution-journal.ts)). Content Fox read stays until Reset; source deletion keeps it and says so |
| Phone app payloads | Computer → worldlet.ai relay → paired phone | End-to-end encrypted (HKDF-SHA256, AES-256-GCM); the relay keeps ciphertext and hashed tokens, queued messages expire after seven days, unpairing deletes them ([phone pairing](../../core/phone/README.md)) |
| Analytics | App → PostHog | Own Google email, display name and derived account ID after sign-in; never credentials, message bodies or conversations ([analytics](../../core/diagnostics/ANALYTICS.md)) |

Regression checks: `scripts/execution-journal-check.ts` (credential text in the
journal), `scripts/google-token-files-check.py` (token and profile file modes,
interrupted writes), `scripts/google-connect-check.py` (scopes and reuse).

Only the owner can do the rest: match the optional Send and Drive scopes in the
Console Data Access list and the lab's scope inventory to the submitted build,
and run the lab assessment itself.

## References

- [Demo video requirements](https://support.google.com/cloud/answer/13804565?hl=en)
- [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [Events get](https://developers.google.com/workspace/calendar/api/v3/reference/events/get)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
