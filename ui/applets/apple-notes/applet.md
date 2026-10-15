# Notes

Read up to 50 notes in Notes order on this Mac. Locked notes and attachments are not imported.

## Runtime

- Stable identity: `app-apple-notes`; provider: `apple-notes`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

## Notebook view

Notes opens as a two-page notebook on its theme's registered paper surface: folders
and searchable note titles on the left, the selected saved original on the right.
Long notes scroll inside the paper. On narrow windows the list and note occupy
one page at a time, with an **All notes** control to return to the list.

The original is read-only, including imported checklists. **Copy note** copies its
text; **Open original** keeps the existing source reader available. **New note with
Fox** drafts a request in Fox's message bar and preserves the existing confirmation
flow. It does not silently write to Apple Notes. No content or attachments are
invented to fill the notebook.

The [selected visual reference](../../../resources/styles/builtin/references/registered-scenes/concepts/apple-notes/effect.webp)
is implemented by `open.ts` and `open.css`. After `npm run build:native-ui`, run
`node scripts/notes-notebook-preview.ts`, serve the repository root, and open
`/output/notes-notebook/` for the production view with fictional records.

A theme can declare separate `heading`, `index` and `status` regions around the
primary reading page. The same notebook puts its search, folders and title list
on the left leaf, original content on the right, and source actions/status below.
The host projects each region onto its measured paper plane. A distributed book
uses the scene renderer's smaller reading-width threshold, rather than expanding
one narrow leaf across the entire window. Search and selected-note focus survive
record refresh; late reads cannot replace a different or detached notebook.

The explicit original route keeps the painted notebook behind its shared text
reader. Its existing reading body remains the scroll owner; previous/next source
controls sit below the page. The index is inert during original reading so a
preview action cannot change behind that route. Back restores the live notebook.
