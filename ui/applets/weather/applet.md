# Weather

The sky you are actually under, on the ground where you live.

## Runtime

- Stable identity: `app-weather`; provider: `weather`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **observation**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

The measured forecast board keeps its material font and uses the painted frame,
without an additional shared card border. Selection and keyboard focus are inset
on forecast cards so the first and last dates remain fully outlined inside the
scrolling surface. Both three- and four-row day details fit above the footer.
