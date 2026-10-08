# Warm paper HUD

Integrated from the HUD family proposal on 2026-09-25 at the user's request.
`paper.png` is an original full-bleed material generated with the built-in image
tool from `../../drafts/hud-v1/review-board.png`; exact prompt is in `paper.prompt.txt`.
The tool does not expose an exact model version. The PNG is retained unmodified.

Separating opaque painted material from runtime silhouettes avoids the draft
atlas's stray alpha fringes. `ui/components/hud.css` owns the shared presentation:
paper pills, honey primary state, clean circular controls, input and panel skins.
The original button atlas is registered without duplication. Panel and close
controls display tight circular windows **inside** its painted discs; the dirty
outer edge/gutters are never displayed. Other symbols remain accessible vectors
with matching rounded weight, not rasterized labels or provider marks.

Fox's dialogue retains its asymmetric cloud mask, separate slightly tilted name
tab and upright paging triangles. No rotation of text, no continuous wobble, no
fixed-height rectangle. Existing width and pagination rules remain authoritative.
Day/night share an ungraded readable paper surface. Reduced motion suppresses
state transitions. Native semantics, labels, focus and disabled behavior remain.

