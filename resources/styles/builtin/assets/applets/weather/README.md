# Rooster weather device

`peek.png` restores the approved golden-rooster weather vane and cream stone sundial pedestal. Generated with built-in imagegen on 2026-09-19, using `resources/styles/builtin/assets/world/devices/weather.png` as the visual reference.

Edit prompt: preserve the exact charming golden rooster, sculpted face and tail, horizontal brass arrow, sage/gold sunny dial and stacked cream stone column; remove the opaque background and haze, retain a tight contact shadow, improve cutout resolution, preserve elevated view and subdued gold/cream/sage palette. No scientific instruments, extra scenery, text or UI.

This is a single transparent decorative sprite. The rooster, arrow and dial are painted together: they do not currently rotate or report measured wind, pressure or solar time. The previous procedural arrow rig was removed because it duplicated the painted arrow and did not fit this silhouette. True weather uses the existing HUD and native seven-day Open/Focus views. The existing transport now requests seven daily records. Shared hover, ground registration and day/night grading apply.

## Native forecast

Peek retains the rooster. Open shows today and the next six forecast dates in the location timezone, with weather icons and high/low Celsius temperatures. Focus reads that exact day, precipitation probability and maximum wind, and supports adjacent-day navigation. Empty, stale or failed data asks the user to set location or retry with Fox; no records are invented. Older caches without daily records refresh automatically. Daily fields follow the [Open-Meteo forecast API](https://open-meteo.com/en/docs). No date-specific third-party website link is claimed.

Validation: `node scripts/weather-applet-check.ts` covers seven records, mixed weather icons, selection, next day, back, no browser dispatch and stale data. `swift build` validates the native fixed-purpose request. Live provider availability remains outside the fixture check.
