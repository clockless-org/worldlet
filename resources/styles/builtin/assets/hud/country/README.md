# Country app materials — #1563

Generated on 2026-10-04 with the built-in imagegen tool, following owner feedback
that the previous lightweight HUD lost its country character. The exact model
version is not exposed by the tool. No user mail or private content was supplied.

- `stationery-master.png`: original 1254 × 1254 RGBA generation. Thin oak backing,
  deckled ivory paper, brass corner clips and a sage sprig. Prompt:
  [stationery.prompt.txt](stationery.prompt.txt).
- `rail-master.png`: original 2161 × 728 RGBA generation. Shallow oak rail with
  sage end caps. Prompt: [rail.prompt.txt](rail.prompt.txt).
- `stationery.png` and `rail.png`: runtime crops, resized to 1024px wide using
  Sharp. Both preserve actual generated alpha; no repainting or alpha replacement.
  [extraction.json](extraction.json) records exact source rectangles.

The style manifest registers `country-stationery` and `country-rail`; native
`buildUI` copies them under `hud/`. The served games build copies both as well.
CSS nine-slicing keeps corner details fixed while the middle stretches.

Mail loads stationery behind its existing live HTML; its single body scroller,
subject, metadata, attachments and links retain their behavior. Game titles use the rail. The accepted Mail and title borders are unchanged. System Back/Home/Fox controls retain glass. The decorative pseudo-elements
ignore pointer events. Reduced motion disables control transitions; forced colors
hides decorative image layers. Night keeps dark readable ink on the light artwork.

The owner approved these frames and selected sage-glaze action buttons (option 3).
