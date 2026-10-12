# Google Slides

## Website presentation

Opening this Applet loads its original website in Worldlet's isolated browser surface. The Village theme supplies only the backdrop and measured page rectangle; the site's own interface handles editing, navigation and account sign-in. Existing authorized data readers remain available to Fox and Attention; opening the site does not grant them new access.

## Runtime

The saved-content reader uses the existing explicit Drive read-only grant,
with a type-filtered list (20 per page). Account changes invalidate cached content.
No writes, background ingestion or automatic model processing.

The saved-content reader presents the provider export, not a summary. Docs and Slides export plain
text; Sheets exports only its first worksheet as CSV, rendered as an HTML table.
Images, comments, layout and other sheets remain available through Web.

## Status

Building: local protocol and UI fixtures; real-account acceptance pending.
The curated reader requires the host's `curatedSourceRead` capability (the desktop app declares it); unsupported hosts retain Web.
