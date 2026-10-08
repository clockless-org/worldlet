# Mail Open parts

Generated with the built-in image generation tool on 2026-09-23 from the actual Mail Open screenshot. `target.png` is the intended composition, not a runtime background. The independently composited PNG sprites are `envelope`, `bin`, `sign`, and `flight`. `bin-front` is the front-rim occluder cropped from the same bin, so letters sit inside its mouth.

Prompt sequence:
1. Refine the existing screenshot: preserve village, mailbox and Fox; two dimensional cream envelopes with live readable labels above; small Needs you wood sign; three lower oak sorting bins (Other mail, Promotions, Spam); muted sage, amber and oak; no extra flowers or flat cards.
2. Extract four blank production parts in a 2×2 atlas: paper envelope with wax seal/address plaque; empty sage-rim oak bin; blank rope-hung wood sign; oblique flying sealed letter. Matching lighting and materials, no baked text.
3. Replace the failed checkerboard transparency with flat #FF00FF, preserving objects and removing ghost background shapes. Crop each part, remove chroma background, trim alpha padding; no model or geometry generated.

Source generation IDs: `exec-5f7df6c9-bfc2-41ff-91f7-0834df0bc5a2` (target), `exec-1447cd11-41cb-4331-a067-1d2a0aaf9bea` (intermediate atlas), `exec-51d21ef5-9fcd-43b2-a87f-d579302466c5` (keyed atlas). Native build embeds the sprites as data URIs; target is documentation only.

DOM text overlays the blank plaques, retaining accessible names and exact record identity. CSS animates independent letter sprites only during an active Mail read. Reduced Motion disables motion. Bin counts refer only to loaded thread groups. Promotions/SPAM are derived from provider label IDs, never guessed from subjects, and browsing bins does not change provider labels.

## Guided attention mark

`attention.png`: generated with the built-in imagegen tool on 2026-09-23, using `resources/styles/builtin/assets/world/devices/gmail.png` as the style reference. Prompt: single isolated warm amber painted 2.5D exclamation mark, rounded matte bevels, upper-left light, transparent background, readable at 48px. No service branding. Used for the Mail introduction; the spotlight has no duplicate marker.

Presentation correction, 2026-09-23: the extracted parts were more contrasty and orange than the original `resources/styles/builtin/assets/world/devices/gmail.png`. Runtime CSS now applies one muted matte grade to all painted parts (including matching bin occlusion layers), with softer shadows and no category hue rotation. Live labels remain ungraded for readability. Open uses smaller envelopes and lower sorting bins now that Fox occupies the right side. The original asset files are preserved.

## Painted pinboard and matching bins — 2026-09-23

Generated with imagegen using `resources/styles/builtin/assets/world/devices/gmail.png` as the palette/material reference. `board.png` is a blank cork pinboard in a rounded oak frame with brass thumbtacks. The three matching bins carry physical folder/clip, coupon/tag and wastebasket ornaments. Native text names them For later, Offers and Spam; these are local presentation groups, not remote archive/delete operations.

Prompt: production atlas, 1536×1024; blank cork board above three matching sage-painted oak open mail bins with blank cream name plaques; muted handpainted miniature, matte brass, upper-left light, no text or flowers. Correction: preserve all objects; replace only the backdrop with solid #FF00FF for extraction. Generation IDs: `exec-829d7c80-855b-46aa-a384-23cf758c4ec6`, corrected `exec-6f883644-9173-4fca-9cd7-643a720db2ed`. Crops use common 483×437 bin canvases; front occlusion begins at row 265 of that canvas. Chroma alpha removes the background; DOM labels and letter sprites remain independent. The manifest embeds these into both browser and native builds.

## Larger attention board — 2026-09-23

`board.png` replaced by imagegen output `exec-c3839afb-8594-4205-9d23-78594a5fe820`, using the previous board as reference. Prompt: a 1.85:1 frontal muted oak/cork board, integrated cream/brass “Needs Attention” plaque, six brass thumbtacks for a three-column/two-row layout, empty interior, true transparent background, no scenery. Source alpha is preserved. Native letter titles remain live; the plaque is part of the painted artwork. Ordinary bins expand into a separate scrolling letter spread and never populate this board. Arrival sprites run once per actual provider read, not for the model's entire background check.
