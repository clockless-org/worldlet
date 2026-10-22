# Obsidian

A vault is a folder of Markdown files; point Worldlet at it and it reads, never writes.

Measured scenes can show the folder tree, Markdown reader and linked notes on
separate regions. Search filters the index without replacing the open note.
Wiki links (including aliases and heading suffixes) and relative Markdown links
resolve against the listed vault files. Missing or ambiguous targets do not
trigger a guessed read. Choosing and disconnecting still use the existing native
adapter; inline controls replace the duplicate connection guide in these scenes.
Balanced fenced and inline code is excluded from wiki-link discovery. The linked
notes column lists outgoing wiki links, not a whole-vault backlink index.

## Runtime

- Stable identity: `app-obsidian`; provider: `obsidian`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
