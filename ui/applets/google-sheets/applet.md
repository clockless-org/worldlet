# Google Sheets

## Runtime

Native Peek → Open → Focus. Uses the existing explicit Drive read-only grant,
with a type-filtered list (20 per page). Account changes invalidate cached content.
No writes, background ingestion or automatic model processing.

Focus presents the provider export, not a summary. Docs and Slides export plain
text; Sheets exports only its first worksheet as CSV, rendered as an HTML table.
Images, comments, layout and other sheets remain available through Web.

## Status

Building: local protocol and UI fixtures; real-account acceptance pending.
The curated reader requires the host's `curatedSourceRead` capability (the desktop app declares it); unsupported hosts retain Web.
