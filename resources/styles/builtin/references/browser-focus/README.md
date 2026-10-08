# Browser Focus scenery

Nineteen full-screen plates: the existing YouTube cinema plus eighteen new images generated with built-in imagegen on 2026-09-19. Files live at `resources/styles/builtin/assets/applets/<key>/focus-day.png`. Open `index.html` for the contact gallery and a clearly labeled browser-space overlay.

## Shared generation prompt

Use the YouTube Focus plate as composition/material reference. Landscape 1536×1024, continuous dimensional painted Tiny Glade landscape. Hero device in the upper-middle right third, quiet left two-thirds for a real website, uncluttered lower right for Fox. Subdued sage/cream/oak, soft daylight. No UI, browser mockups, text labels, people or Fox; recognizable brand emblems allowed. Reduce vegetation and saturation relative to reference. Each subject below replaces the cinema.

## Subject prompts

- **plaid**: Plaid financial connections: a small orderly cream-stone vault terrace, warm oak folio strongbox and interlocking brass lattice emblem, several closed account ledgers. Trustworthy calm, no money piles.
- **oura**: Oura sleep and recovery: a peaceful shaded resting nook with a linen lounge and large elegant dark Oura ring on its sage charging pedestal, a small moon-shaped brass ornament, quiet lake dawn atmosphere.
- **strava**: Strava outdoor activity: a tasteful trailhead bicycle rest and repair station with one dimensional orange-accent road bicycle, trail marker with two upward orange chevrons, winding mountain cycling path in distance.
- **fitbit**: Fitbit daily health: a compact outdoor wellness station, large rounded watch on a teal and oak charging pedestal, teal dotted diamond Fitbit identity on an instrument, a walking path and rolled linen towel.
- **google-maps**: Google Maps wayfinding: a warm oak map lectern holding a dimensional folded map, prominent classic multicolor Google Maps location pin sculpture integrated in lectern, brass compass, small road signposts and winding roads in far valley. No readable labels.
- **airbnb**: Airbnb stays and travel: refined cream and muted coral hot-air balloon with recognizable white Airbnb Belo symbol, hovering above a little timber lakeside landing dock, wicker basket and travel trunk. Balloon fills right upper-middle third; no buildings blocking it.
- **tripit**: TripIt travel organization: a refined navy-blue open itinerary suitcase on a warm oak dock bench, paper travel cards neatly arranged in dividers, small brass route compass, blue departure-sign motif without letters. A distant lake ferry.
- **x**: X social posts: a handsome charcoal and oak public message stand, original white X mark on its upper plaque, three tidy paper post cards below and a small brass broadcast horn, outdoor village notice terrace.
- **tiktok**: TikTok short video: upright portrait screen with recognizable TikTok music-note logo, black screen restrained red/cyan accents, short oak viewing stand and two small speakers, small open-air performance corner in meadow.
- **discord**: Discord communities: a comfortable outdoor conversation nook with two low curved oak listening chairs, central compact purple voice console bearing cream Discord Clyde logo, brass microphone and headset, welcoming small community gathering terrace.
- **browser**: Browser web exploration: a beautiful large sage-green and muted-blue terrestrial globe on a cream meridian holder and oak pedestal, small explorer terrace overlooking a wide landscape, only globe as hero, no magnifying glass.
- **doordash**: DoorDash food delivery: a charming compact red delivery bicycle with insulated red delivery carrier bearing white DoorDash wing mark, parked beside a tiny village picnic bench with one closed takeaway bag, near river bridge. Not a food stall.
- **notion**: Notion knowledge workspace: handsome warm-oak card catalog cabinet with cream paper folios and prominent original black N in outlined white cube motif integrated into cabinet, outdoor reading garden with sparse bookshelf and writing ledge.
- **obsidian**: Obsidian connected notes: elegant faceted purple crystal suspended above a small oak circular writing table, a few blank paper notes connected by fine brass thread arcs, quiet outdoor knowledge garden. Crystal silhouette recalls Obsidian.
- **stripe**: Stripe payment infrastructure: small refined lavender-accent brass payment-routing desk with cream receipt reels and tidy customer ledger trays, dimensional curved stripe S rails integrated in machinery, calm open mint terrace.
- **paypal**: PayPal merchant invoices: a handsome blue-and-cream invoice counter with paired interlocking blue P emblem, cream invoice folios and small brass payment terminal, quiet open market accounting terrace. No piles of coins.

- **gmail**: A charming wooden village mail station with an open red mailbox, cream envelopes and a brass sorting rack.
- **google-calendar**: An outdoor village calendar desk with cream perpetual calendar board, wooden date tiles and a brass clock.

## Runtime contract

Every direct web route and Mail/Calendar/Notion/Obsidian/Stripe/PayPal web escape uses its own painting. Native Open and native item Focus keep the village. Backgrounds load on first entry, not on startup; until ready, the normal device remains visible. A failed load retains the normal village and is not retried every frame. A shared gentle push-in, feathered peripheral blur, shared environment grading and right-aligned cover crop apply. Fox and browser controls are unchanged. Narrow windows retain the normal scene. These are static daytime paintings, not animated or independently authored weather/night scenes.

## Validation

`node scripts/browser-focus-check.ts` exercises all seventeen scenes, no startup Focus fetch, native Open preservation and returning to the entry scene, with local browser transport fixtures. Actual website login and content are not mocked in the product, and this check does not claim live login acceptance.

### Native WebKit loading

Focus images are emitted as individual local JavaScript assets containing data URIs. Only the selected asset is loaded and decoded. This avoids file-origin PNG WebGL texture failures without bundling every background into startup data. Browser Focus terrain clicks return to the saved entry level, including while the plate is loading.
