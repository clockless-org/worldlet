# Reminders

Read your reminders on this Mac. System access is requested only when you connect.

## Runtime

- Stable identity: `app-apple-reminders`; provider: `apple-reminders`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

## Village task board

[open.ts](open.ts) arranges saved reminders on the registered paper board. All, Today, Scheduled, list selection and text search filter the loaded records. The title, due date and completion status come from the original; selecting a row opens the existing details reader. Completion indicators are read-only because this connector does not expose a write operation. Add a reminder prepares a request in Fox for review.

Preview: build the native UI, run `node scripts/core-paper-preview.ts`, serve the repository root and open `/output/core-paper-applets/?applet=apple-reminders`. All preview records are fictional.
