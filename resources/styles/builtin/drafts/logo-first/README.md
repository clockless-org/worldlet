# Logo-first Peek devices — 2026-09-26

User direction: dimensional original identity first; small functional additions second. Preserve the map and installed positions. YouTube and Netflix remain the accepted benchmarks. Generic Home devices remain unbranded.

## Current batch

- x: `../../assets/applets/x/peek-logo-v2.png`
- tiktok: `../../assets/applets/tiktok/peek-logo-v2.png`
- discord: `../../assets/applets/discord/peek-logo-v2.png`
- spotify: `../../assets/applets/spotify/peek-logo-v2.png`
- instagram: `../../assets/applets/instagram/peek-logo-v2.png`
- google-maps: `../../assets/applets/google-maps/peek-logo-v2.png`

Generated with the built-in image_gen tool, transparent PNG. Each request uses the previous Peek as edit target and YouTube Peek as material/style reference. No recoloring or pixel painting after generation. Masters remain at their generated dimensions. Registry resolves each new device for native and web builds; Focus backdrops are unchanged by this batch.

## Exact prompts

Shared prefix:

Use case: stylized-concept. Production isolated transparent PNG sprite for Worldlet cozy village applet, square. Redesign the supplied existing device (image 1); image 2 YouTube is MATERIAL/STYLE reference only. FIRST PRIORITY recognizable original app icon faithfully translated into a thick sculptural physical object, about 75-85% of visual mass. SECOND PRIORITY just one or two much smaller functional attachments. Gentle view 18 degrees sideways and 25 degrees downward, front dominant, rounded matte painted enamel and small warm timber/brass accents, soft upper-left daylight. Same handmade dimensional village style as YouTube, not glossy plastic, not photoreal. Whole object centered with narrow clear transparent margins, sturdy bottom contact, no landscape, no surrounding flower bed, no UI, no text labels, no pedestal consuming space. Preserve original brand geometry and colors; keep detail quiet.

### x

A large charcoal rounded-square thick slab with faithful white X in shallow ivory relief covering nearly entire front, it is a public post broadcasting plaque. A tiny brass speaking horn at its right lower side and single paper post tucked behind bottom edge. No typewriter, no keyboard, no desk.

### tiktok

A freestanding thick TikTok musical-note sculpture with faithful black/ivory main note and cyan/red offset edges. Fully unobstructed recognizable silhouette. One tiny wood-framed portrait-video screen nestled beside its foot and one small recording lens, together less than 20 percent of device. No smartphone obscuring logo, no huge stand, no repeated logos.

### discord

The Discord app icon as a thick rounded blurple enamel block, huge faithful ivory Clyde gamepad-shaped face with two blurple eyes occupying its front. The block itself is a village voice intercom. One tiny brass microphone on lower side and small listening earpiece behind side. No duplicate logo, no large headset obscuring silhouette.

### spotify

A large upright thick green circular enamel Spotify medallion with faithful three black curved sound bands, bands double as recessed speaker grilles. At its foot a small walnut record-slot with a partially visible black vinyl and tiny brass volume knob; these occupy less than 20 percent of object. Circular green brand silhouette dominates, not a rectangular radio.

### instagram

Original Instagram rounded-square gradient icon as thick dimensional enamel camera body, faithful purple-magenta-coral-gold color progression softened slightly for village. Huge ivory rounded-square camera outline, central circle and upper-right dot retained exactly in front. Central circle subtly protrudes as lens but remains white icon circle. One small photo print emerging underneath and a tiny brass shutter on top. No tiny badge logo, no traditional generic vintage camera instead of logo.

### google-maps

Faithful Google Maps multicolor pin as large thick freestanding sculptural navigation marker, blue red yellow green segments and circular hole, 80 percent of visible mass. Its pointed foot rests on a small folded cream route map with a very small wooden sign arrow beside bottom. Pin dominates, no large table or lectern, no landscape.

## Acceptance

Review at 84px World width and 212px Region width, plus day/night composition. Confirm original silhouette, dominant logo, supported contact point and no excess ornament. New art does not create an animation or change account behavior. Remaining catalog devices have not been regenerated in this batch.


## Review result

`review.png` shows old/new at Region size and new at 84px width. X loses its keyboard; TikTok loses the obstructing phone; Discord loses the large headset; Spotify restores its circle; Instagram makes the brand outline the camera; Maps reduces its lectern to a folded map. The six masters have valid transparent alpha. Optical calibration changes only those six entries. The map, landmarks and saved ground slots are unchanged; slot regression checks pass.

Discord's first edit retained too much of the old headset and was rejected. The final generation uses the supplied user reference for identity and YouTube for materials; its exact prompt is in `discord-final-prompt.txt`. The initial Discord prompt above records the rejected attempt.

Known existing check failure: `check:style` assumes every registered asset is in the active catalog. The manifest contains 112 entries while the filtered catalog has fewer. This batch changes six paths and no catalog keys; it does not address that separate assertion.
