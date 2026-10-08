# World packages

Every package is the space of one [Theme Pack](../themes/README.md) and declares its style (today the sole built-in `cozy-miniature@1.0.0`) and an explicit `artStatus` (`draft` or `approved`). Unsupported or missing style dependencies are rejected. Export permits drafts for review and warns; exporting is not runtime activation or visual approval. Style resources live in `resources/styles/builtin/`; world geometry and empty slots remain in the world package.

Each folder is one portable world: art plus declarative layer stack, regions and empty Applet slots. `village/` is the current six-court modular package; earlier native 4K versions remain as provenance. World packages describe places; user application assignments and private state are stored separately.

Schema and data validation live in `ui/world/world-pack.ts`. Package/preview tooling lives in `scripts/world-pack.ts`. Packages are not executable plugins; importing an arbitrary archive is not yet implemented. The existing application continues using its current authored runtime layout until explicitly connected to a package.

An Area can declare an optional `closeView`: a clean scene `src`, exactly the same slot IDs as its
overview, close-view `anchor`/`maxSize` pairs, optional Applet-keyed `devices`, and normalized
`occlusion` rectangles that redraw the clean plate in front of objects. Its coordinates address the
whole close scene. Slots remain references to shared user assignments, never private Applet data.
The renderer projects art, hit targets, labels and placement controls through one transform.
Overview `layers` can separate `environment`, `architecture`, optional `atmosphere` and `foreground`.
Once separated, every kind requires a day/night pair with identical normalized bounds, opacity and
parallax. Decorative `parallax` is bounded to ±0.01 of the logical canvas; architecture must stay
fixed with its Applet floors. Optional `opacity` is 0–1. A theme's lighting adapter must mix each pair's
premultiplied pixels in one pass so opaque walls do not turn transparent at dusk. Layer prompts and
images follow the same safe package paths. Optional `sourceSize: [width, height]` records a layer’s
actual native pixels (default: the package canvas); export verifies each file against that size and
composites the daytime planes in its review page. Source resolution is independent of logical coordinates.
Optional `ambience` fields declare a stable ID, a supported effect kind (`light`, `dust`, `motes`,
`ripples`, `stars`), normalized bounds, a hex color and at most 32 particles per field. The runtime
clips every field to its painted fixture and pauses it with motion, visibility and activity rules.
Export includes the close plate and device files with the same local-path validation. Legacy area
aliases continue addressing the same slots. `scripts/fixtures/authored-world-pack.json` exercises these fields.
