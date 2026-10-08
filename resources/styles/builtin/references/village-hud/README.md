# Village HUD · 26 September 2026

`components.png` is the user-approved component direction. Approval explicitly
reduces the primary button: no thick timber frame. Keep forest fill, a fine
honey edge and a slight inset highlight. The board's invented slogans, large
avatar actions and example Notes branding are not production copy or navigation.

`weather.png` applies that language to current conditions, seven daily rows,
selected-day details and provider attribution. Sample dates/numbers in the image
are illustrative only; production always uses normalized Open-Meteo data.

## Implementation contract

- Paper `#F4F0E5`, ink `#203B30`, forest `#315F48`, honey `#EDC47D`.
- Night content uses deep forest and ivory text, never a darkened screenshot.
- Inter, 28px title, 16px body, 14px controls, 12px secondary text; 44px targets.
- Only outer header/empty-state decoration; text and all controls remain DOM.
- `appletSurface`, `actionButton`, `facts`, `notice`, `emptyState` are the shared
  default primitives. Use shared classes for tabs, lists, choices and inputs.
- The live `ui-gallery.html` demonstrates Notes, inputs, button states, choices,
  errors and empty states. It is not a functioning Notes account integration.
- Weather uses the same shell; its data rows are a focused Applet component.
- Existing third-party websites, Fox actions and provider identity stay unchanged.

## Asset provenance

All three images were produced with the built-in Image Gen tool, using the
approved component board as the reference for follow-up images. No personal
weather data or location was uploaded. Runtime asset:
`../../assets/hud/village/lantern-corner.png`, registered as `hud.village-corner`.
Original alpha is preserved; CSS controls its displayed size.

Corner prompt: Create one production UI decorative corner asset on genuinely
transparent background, no text or labels or frame. Use the approved Worldlet
HUD board as style reference, specifically its tiny plants, stones and warm
lantern in the upper-right corner of the dark panel. One compact low cluster:
a small warm glowing bronze village lantern resting beside two smooth pale
gray river stones and three sage green leaves, tiny moss patch. Soft painted
dimensional miniature, matte rounded forms, gentle warm light, front three-quarter
view, no harsh shadows, no black outlines, no photorealism. Occupy central 75%
of canvas, entire silhouette intact, clean alpha outside object and subtle tight
shadow. It will display at 48–64px wide at the outer edge of clean readable panels,
not dominate. No buttons, no wood plaque, no words. Match the original accepted board.

Weather concept brief: one complete warm-paper Weather panel, current location,
current temperature and condition, wind and observation time; seven daily rows
with weather glyphs, min/max range and precipitation; selected-day wind,
sunrise/sunset; provider attribution and Refresh. Match approved colors and
restrained corner art, no chunky wooden button, no invented historical data.
