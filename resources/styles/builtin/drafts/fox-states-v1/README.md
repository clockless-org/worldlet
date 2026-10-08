# Fox state artwork — production studies

Goal: implement the entire [32-state repertoire](../../../../../ui/companion/ANIMATION.md)
at the approved original-art quality, including authored body silhouettes,
continuous transitions, truthful runtime routing and visual acceptance.

The Rive Fox replaced this rig in every channel (#1526); it remains a development
fallback and input to the Rive generator. The rig's checks named below were removed
afterwards and are kept in Git as history.

## Current evidence, 2026-09-26

- Mixed-prop review now retains the book, laptop and magnifier through repeated
  Dev transitions. Delighted uses a seated phrase with a released lap book and
  preserves its free-hand hop otherwise; no new image assets are needed. Gesture
  support is frozen at entry, including interrupted book retrieval. Numerical
  and rendered checks are saved in the animation record; native acceptance is
  still open.

- Dev work handling is integrated with retained parked placement. Live pacing
  now uses 650ms typing recovery + 3200ms lid motion + 3600ms carrying, while
  slow authoring reviews keep their original defaults. The saved curves and
  artwork are unchanged. Exact endpoint, interruption and actual Dev-loader
  checks accompany the retiming; native continuous acceptance remains open.

- Closed-laptop handling: `working-stow-path.json` contains 271 samples of six
  rotation channels generated from `fox-working-stow-study.ts`. Reproduce with
  `node scripts/fox-working-stow-bake.ts` (stdout); verify with `--check`.
  The continuous spline player handles interrupted carry, hold and retrieval;
  the reference solver is not needed during playback. This is draft motion
  data, not new artwork or native acceptance. The subsequent shared Dev player
  enables cross-prop integration; release artwork remains unchanged.

- Explaining/palm follow-up: `Explaining motion` adds a 6.2s two-phrase gesture,
  with a left-paw gather, right-palm offer, unequal accents, pause/blink and
  planted return. `fox-paw-turn.ts` originally registered the open palm in
  `explaining.png`; Dev now uses its `open-paw-rounded-v2.png` derivative via
  `registeredArt.openPalmR`, not that key pose's head/body. The derivative removes
  the opposed thumb-like projection and clusters the short rounded toes; its
  exact built-in imagegen prompt and inputs are saved in the sibling provenance
  JSON. Original art remains available; native acceptance is pending.
  A connected wrist and original-fur side wall keep
  volume while the painted palm turns edge-on; closed/open faces switch there
  without whole-paw fading. Both use shared bounds and identical wrist pixels.
  The wrist-turn channel participates in continuous interrupted pose mixing.
  Checks cover 125 rendered samples, exact endpoints, no clipping, painted
  connectivity, face-swap continuity, GPU/reference parity and small HUD/reduced
  motion; broader regressions cover 241 frames and 210 parameter interruptions.
  Real reply-duration integration, actual speech articulation, full-catalog clearance
  and native/live integration are not finished. The six anatomical studies are
  not six completed production states.

- Shoulder/grooming follow-up: `registeredArt.arms.*.shoulderBlend` defines a
  proximal-only quintic opacity band. It blends the rounded forelimb cap into
  the existing coherent torso, without softening distal fur or paws and without
  generating replacement artwork. `Grooming motion` is a separate 5.2s study:
  two short chest/belly-fur brushes, a downward inspection gaze, then paw return.
  The first across-the-other-arm trajectory was corrected after frame review.
  Gaze is now a continuous channel in the interrupted mixer. Focused checks cover
  two stroke phases, 56 rendered attachment samples (no detached component above
  20 pixels at a 256px analysis size), 168 motion frames, 84 interrupted parameter
  cases, play/pause, reduced motion and 144px/mobile previews. Connectivity is not
  proof of final shading quality or all-pair rendered transition acceptance.
  No live scheduling or renderer replacement is made; reading uses a separate
  grip atlas whose attachment work remains independent.

- Neck and acknowledgment follow-up: `neck-underpaint.png` adds the short furry
  neck and rear collar hidden by the original head. Built-in imagegen provenance
  and exact prompt are in `prompts-neck.json`. The inspector masks it to the
  original head-owned pixels within `registeredArt.neck.crop`, draws it with the
  chest transform and leaves exact rest unchanged. It does not replace facial
  pixels or stretch the head. The new **Acknowledging motion** study is 2.4s:
  one paw touches the chest, a single small nod follows, then the paw returns.
  A high-hand/low-eyelid first draft was rejected visually and corrected.
  The clip/geometry checks now include this third study; the rendered regression
  contains 141 samples, and parameter-interruption checks cover 42 source/target
  cases. The neck-specific check covers 15 tilt/translation combinations, real
  backing contribution, crop isolation, neutral identity, controls, reduced
  motion and 144px/mobile rendering. These are not final visual or production
  performance acceptance. Shoulder overlap shading and live routing remain open.

- Ear-root follow-up: rigidly rotating source-cut ears exposed triangular seams.
  `ear-root-underpaint.png` supplies hidden orange fur from built-in imagegen;
  the exact prompt, reference and source ID are in `prompts-ear-root.json`.
  Only ear-owned source regions consume this backing, never the regenerated
  face. `fox-ear-skin.ts` pins the root to the head, keeps the tip rigid and
  progressively bends the cartilage between them. Root curves and blend widths
  belong to `anatomy.json`. Greeting now anticipates the paw wave with ear motion
  and a 2.25-degree rigid head tilt; neutral endpoints and reduced motion remain
  stationary. Checks cover 18,140 painted-ear samples (minimum local Jacobian
  0.4659), 18 rendered ear poses, exact original neutral, unchanged inner facial
  pixels, independent UI controls, 144px/small-screen previews and the existing
  128-frame greeting/thinking/interruption regression. Neck underpainting, facial
  articulation, final overlap shading and live renderer integration remain open.

- Page-contact follow-up: the original gripping-arm mesh was rejected for page
  turning after visual review, despite exact contact and positive local area.
  Large angular warps produced an unnatural elbow/paw silhouette. That rejected
  deformation is removed. `reading-turn-arm.png` supplies an authored longer
  forearm silhouette; `prompts-reading-turn-arm.json` records the exact built-in
  imagegen prompt. `reading-rig.json` owns its source landmarks, part boundaries
  and page hinge/corner registration. Upper arm and forearm/paw now rotate as
  separate rigid pieces, with two-bone target solving and no paw scaling.
  `fox-reading-page.ts` sequences reach, page contact, release and return with
  smooth timing. The contact target and visible page corner share one mapping.
  The new **Page turn study** is separate from Reading motion; ordinary reading
  no longer displays an independently floating page. Both remain inspector-only.
  Tests cover exact contact at 60Hz, contact/release velocity continuity, fixed
  shoulder, rigid paw distances, 69,069 painted-part samples and 92 rendered
  reading/page frames. The hard source-X foreground forearm cut has been removed:
  the complete forearm is behind the cover and above the turning leaf, with a
  smoothly weighted distal paw overlay sharing the identical rigid transform.
  The elbow retains a circular original-art overlap rather than a bare cut;
  an explicit elbow branch and cover-edge rest grip keep the hand attached at
  rest. A six-frame contact sheet covers reach, contact, release and return.
  These checks do not prove final seam quality or natural limb volume; elbow
  shading and the grip silhouette still need visual polish. Pickup/put-down, live
  transitions, full-state performance and final visual acceptance remain open.
- Reading articulation follow-up: `reading-parts.png` separates the sage book,
  curled page and two complete gripping forelimbs. `reading-rig.json` owns crops,
  similarity-registration landmarks, body attachments and book placement.
  `reading-eyes.png` provides downward-looking eye RGB only; it never replaces
  the face. Exact built-in imagegen prompts/provenance are in
  `prompts-reading-parts.json` and `prompts-reading-eyes.json`.
  `fox-reading-study.ts` pins shoulders and binds both grips to the book's subtle
  movement, with a periodic 9-second hold, blink, brief look-up and page study.
  `fox-reading-study-check.ts` checks contact at 60Hz. The rendered check covers
  46 frames, bounds, unchanged face/alpha outside eye RGB, exact loop endpoints,
  desktop/mobile/144px HUD controls and reduced motion. Reading motion is
  available in the anatomy inspector, not the live renderer. Hand-assisted page
  turning, pickup/put-down, state transitions and performance remain incomplete;
  the present page motion is a prop study, not finished reading-state acceptance.
- `anatomy.json` registers 31 hierarchical controls and 26 independently owned
  original-pixel regions: ears, brows, eyes, nose, mouth, jaw, chest/pelvis,
  upper arms/forearms/paws, hind legs/feet, tail and scarf/knot/tail. Left/right
  always mean viewer left/right. This is a **registration draft**, not completed
  hidden-surface art or a finished animation. Eyelid controls now blend the
  approved original/half/closed painted patches independently. The tail chain
  drives a continuous weighted skin, not three independently cut strips.
- `fox-anatomy.ts` composes rigid joint transforms. Parent motion carries its
  children; limb motion cannot change the head. No scale/shear control exists.
  `fox-anatomy-inspector.ts` partitions original pixels without changing colors;
  adjacent parts sharing a transform are composited before rotating, avoiding
  antialias seams through an otherwise rigid head.
- `node scripts/fox-anatomy-studio.ts` builds
  `output/companion/anatomy-studio.html`: per-joint rotation, single-layer view,
  original comparison, exploded view, joint hierarchy and 144px HUD preview.
  The inspector deliberately exposes missing overlaps; large poses show gaps
  and are **not suitable for live replacement**. Polygon contour refinement,
  painted overlap registration and original-size visual acceptance remain open.
- `node scripts/fox-anatomy-check.ts` tests hierarchy isolation, rigid transforms,
  pivots and limits. `node scripts/fox-anatomy-render-check.ts` checks exact
  neutral reconstruction and head isolation during articulated arm movement.
  Playwright visual QA (Browser plugin unavailable) covered 1100×900 and
  390×844 views, controls, dark HUD size and console health. Neutral source
  comparison had zero changed channels at native resolution; this does not
  prove moving-joint seam quality or completion of any of the 32 states.
- Detail-rig follow-up: widened the eye registration masks to cover the original
  eye outlines fully; feathered replacement RGB without changing alpha. Fixed
  the left hind-leg boundary that incorrectly owned a triangular piece of tail.
  Tail weights now pin the root while its middle/tip bend. Tests cover 27 angular
  limit combinations with positive skin Jacobians (minimum sampled 0.118), eight
  independent eyelid samples, original alpha, and unchanged head during tail
  motion. Playwright screenshots were inspected at 1100×900, 390×844 and 144px HUD
  size. Angular-limit tests do not certify arbitrary translations or frame rate.
  The Canvas triangle implementation is an inspector path, not a production
  performance claim. Neck/shoulder/elbow underpainting still blocks promotion.
- Arm-skin follow-up: upper arm, forearm and paw now share a continuous skin.
  The centerline is integrated with preserved length and rigid cross sections;
  simple linear bone blending was rejected after it inverted the inner elbow.
  Ninety shoulder/elbow/wrist angular combinations preserve shoulder anchors,
  cross-section width and positive sampled Jacobians (minimum 0.130). Child
  translations are not consumed by this connected skin; future hand targets
  need IK, not disconnected limb translation. The cached skin is scoped to each
  immutable pose matrix map and is collectable afterward.
- The original-cut diagnostic mode retains the old chest-fur and cut-paw defects;
  `underpaint:false` also exposes its missing arm backing. It is not live art.
- `complete-forelimbs.png` supplies newly painted complete orange/brown limbs,
  without attached white chest fur, from built-in imagegen. Exact prompt and
  provenance are in `prompts-forelimbs.json`. Normalized crop/affine registration
  in `anatomy.json` now connects them through `fox-anatomy-art.ts`, together with
  coherent body layers. Shoulder pivots align to the painted attachments. The
  scarf mask no longer carries a white chest wedge. Select Complete limb art
  in the inspector to compare; the approved original face remains unchanged.
- `fox-anatomy-clips.ts` adds two timed **benchmark studies**, greeting and
  thinking, not a production state router. Greeting folds the elbow before
  lifting and lowers before unfolding, keeping the painted paw in frame.
  Thinking places the connected forelimb in front of the scarf/face for chin
  contact. Both have rest endpoints and stationary reduced-motion poses.
  `fox-anatomy-clips-check.ts` samples painted contours at 30Hz and tests limits,
  head isolation, endpoints and cadence independence. The rendered motion check
  covers 69 samples, canvas edges, exact face pixels with blink held, play/pause,
  reduced motion and console health. A 30fps review recording is not a runtime
  frame-rate claim. Full-state transitions, neck overlaps and production
  performance remain unverified; this rig is not promoted into the live app.
- Interrupted-transition follow-up: `fox-anatomy-transition.ts` blends continuing
  clips with quintic weights, including sparse/rest channels and continuous
  front/back ownership weights. Interrupted blends retain their source graph
  until its contribution finishes; there is no forced idle detour or angular
  extrapolation. Completed branches are pruned. The inspector's Interrupted
  transition review switches greeting → thinking → greeting → thinking, including
  an interruption during a blend. Review events are not real task activity.
  Joint-space blending initially swept the paw beyond the right edge: the seated
  study now has an explicit elbow/wrist travel corridor and toe-release lift.
  This is an authored constraint for these poses, not general IK or validation
  of the full 32-state graph. The transition check covers positional/velocity
  continuity, limits, cadence independence, reduced motion and reset.
  Occlusion review uses premultiplied mixing of identical-geometry depth passes
  to avoid a hard ordering pop or opacity dip. It is a Canvas reference path;
  production needs GPU masks/contact-aware depth and performance acceptance.
- `head-underpaint.png` and `body-underpaint.png` are generated backing drafts,
  with exact prompts/provenance in `prompts-anatomy.json`. The head generator
  enlarged/recentered its output despite the constraint: **do not substitute it
  for the original face**. It needs landmark registration and is not consumed
  by the inspector or live app. The body plate supplies the inspector's optional
  coherent torso/hind-leg layers as well as original-cut arm backfill. Both files
  preserve the generated alpha.

- Six full-size transparent key poses: `thinking.png`, `reading.png`,
  `drafting.png`, `greeting.png`, `explaining.png`, `working.png`. The face, palette and fur remain close to the original; new
  forelegs supply chin contact, book grasp and pencil contact.
- Built-in imagegen, precise-object-edit, with
  `assets/companion/rig/fallback.png` as the sole identity/edit reference.
  Exact prompts are in `prompts.json`. Output PNGs are copied unchanged; no
  background removal, repainting or image compositing was performed in code.
- Source IDs: thinking `exec-f2e836e3-7042-4896-8437-d3ddd9aa7475`, reading
  `exec-28f2f5a1-cfd0-48df-8003-d9643581e97f`, drafting
  `exec-e4267982-f742-4213-98e5-5c0a177bfbaf`.
- Second-round prompts are in `prompts-round2.json`. Sources: greeting
  `exec-d7d96075-de29-4327-be67-251869298a76`, working
  `exec-90848546-5927-4947-bb9a-3dee9438747e`, corrected explaining
  `exec-1a375b94-2022-4b53-8ce5-aa7c2e75ef85`. Initial explaining output
  `exec-a0e7dc2d-5e8d-4d7e-b07f-8f90f405df8a` moved the head and was rejected;
  the correction uses the original as base and that output only as arm reference.
- `ui/companion/fox-state-catalog.ts` is the single 32-state production catalog,
  with triggers, performances, timing and explicit art readiness. Missing artwork
  is never advertised as a finished animation.
- `fox-authored-study.ts` supplies pose-specific mesh controls. Writing has
  stroke bursts and rereading pauses. Held-object poses no longer use the idle
  floor-paw control positions. These are study motions, not accepted finished
  performances: page turning, independent fingers and gaze-down art remain open.
- `node scripts/fox-state-studio.ts` builds `output/companion/state-studio.html`.
  The studio offers all 32 specifications, previews the six new studies and
  the live idle reference, has a 144px HUD-scale view and light/dark backgrounds.
  Unauthored states explicitly show no animation. Selecting a study is a hard
  review cut, NOT a production transition demonstration.
- Greeting uses a shoulder-rooted wave, explaining has an offer/pause rhythm,
  and working uses alternating short keyboard presses with an inspection pause.
  Full limb raise/lower, speech mouth articulation and independent prop layers
  still need authoring. These are key-pose studies, not finished states.
- User review caught head stretching in the greeting study. Its whole-image
  arm deformation has been removed: `fox-greeting-study.ts` composites an
  independently rotating `greeting-arm.png` behind `greeting-body.png`, with
  the upper body/head vertices fixed and eyelids still independently animated.
  The extracted arm required scale/offset landmark registration; raw generated
  pixel placement was not accurate enough. The full 32-state anatomical split
  is still pending. Other states must not inherit the rejected broad arm mask.
- Layer prompts are in `prompts-greeting-layers.json`. Built-in imagegen sources:
  body `exec-f32ee1ca-7976-4908-80ad-c74dfc92374e`, arm
  `exec-5e1e0a65-7edc-48e8-aead-113fd32ce92b`; both use `greeting.png` as input.
- Regression: `node scripts/fox-greeting-isolation-check.ts` samples 25 rendered
  frames with blink held, asserts identical opaque head-region pixels and a
  changing arm silhouette. Mesh tests additionally check every upper-body vertex
  remains fixed. This does not prove all other states are deformation-free.
- The existing live renderer now uses `fox-pose-transition.ts`: C1 residual
  blending preserves pose and velocity during interruptions, responds faster to
  listening and settles more slowly into sleep. This applies to continuous
  controls on the current live artwork, not to cross-artwork silhouette changes.

The anatomical inspector also contains an eight-second `listening` study:
ears lead, the rigid head inclines, paws remain planted, a single small follow
and ear adjustment sustain attention, and the pose returns to rest. It is not
yet a production looping hold or audio-driven animation. Its visual review fixed
the lower-left cheek ownership contour: fringe previously assigned to the body
stayed behind when the head turned. `fox-listening-check.ts` covers that ownership,
beat order, fixed paws, controls, HUD scale and reduced motion; the common clip,
render and interruption checks include listening. These checks are not complete
32-state or native runtime acceptance.

Sustained idle/listening/thinking/explaining review is now provided separately by
`fox-anatomy-hold.ts`. It does not replay finite entry/exit clips during a long
task, and a reversal during an unfinished exit resumes the earlier phase.
Explaining retains an open palm after entry, with unequal phrase accents and
pauses instead of repeated pickup/exit. The inspector's hold controls, Hold and
interrupt sequence and 42-second Conversation flow exercise this
state player; they do not enable it in the live app. The hold checks cover
two-minute timing, sparse sampling, 60 interruptions, reduced motion and rendered
controls. A dedicated conversation check covers 576 four-state transition samples
and 72 GPU comparisons. It caught right/left paw ordering changing when face
depth switched; the right offering paw now consistently stays behind the left
chest/chin paw, irrespective of input array order. Full production rendering and the remaining performances are still
required below.

An opt-in GPU skin preview now uses the same registered limb/ear/tail mappings,
caches immutable textures/topology and composites bounded part tiles. The GPU
check covers matching silhouettes/colors, premultiplied alpha, context-loss
fallback, cache reuse and disposal. It is a hybrid Canvas/GPU comparison path,
not a production replacement: measured local timing is only near Canvas parity
after tiling. Full-frame GPU batching, depth handling and native performance
acceptance are required before promotion.

The subsequent GPU whole-frame preview batches all registered non-prop parts
per depth pass and copies the completed frame once. Adjacent source-pixel groups
stay assembled to avoid face seams and use bounded, invalidated texture caches.
It is faster in a local warm 640px diagnostic, but still inspector-only: reading
props are not yet GPU-native.
The common GPU check now covers 56 reference comparisons, whole-frame alpha/
transforms, one-copy behavior, unchanged-group reuse and mid-frame context loss.

Fractional depth now mixes two/four passes in reusable GPU framebuffer targets
with one final composite, instead of copying each pass to Canvas. The expanded
59-image comparison covers both-arm mixtures, resize, premultiplied weighting,
invalid/aborted transactions and loss/disposal. This accelerates the reference
policy but does not approve arbitrary fractional depth as a physical contact.

The authored idle/listening/thinking/explaining hold graph and greeting/thinking
review now keep contact paws solid throughout entry and interrupted exit.
Proximal shoulders always stay behind the scarf; only distal skin changes head
occlusion, at a planted pose where both orders render identical pixels. The
depth check covers 63 such switches with zero pixel delta, 8,906 samples and
an actual exit-contact regression against the old translucent result. This
specific seated route does not implement behind-face clearance for future
states. Fractional mixtures remain diagnostic-only, and the draft still must
not be treated as a completed/live 32-state performance.

## Required next work (not complete)

`delighted` is now an explicit finite inspector study using the existing
anatomical artwork, not new generated Fox pixels. Chest preparation precedes
a single small root lift; independently gathered paws then tuck toward the
scarf, with delayed ear/tail recovery. It ends at exact rest and never loops
or infers happiness from task completion. Reduced motion omits the lift.
`fox-delighted-check.ts` tests one takeoff, planted preparation/recovery,
rigid head, phase seams and endpoint/reduced-motion contracts. Eight finite
studies now have 307 shared rendered samples and 392 transition parameter
cases. Dedicated browser review covers playback, pause/scrub, desktop/narrow
layouts, HUD scale and console health. Hind-leg push-off/landing articulation,
a convincing happy expression, interrupted-flight ground contact and live
promotion are unfinished; a translated seated pose is not a finished jump.

The subsequent seated-support pass replaces chest-only compression with
pelvis/haunch movement and solved foot counter-transforms. A shared body skin
and pinned tail attachment keep their joining edges together; a two-source-pixel
painted overlap repairs raster cracks without changing the original assets.
`fox-seated-support-check.ts` verifies rigid planted soles, shared airborne
root, neutral identity, bounded positive skin Jacobians and attachment equality.
Browser checks verify 360 boundary samples and ten Canvas/GPU comparisons.
This is limited seated support: complete extended-leg push-off and ground-aware
interruptions remain unfinished, and no live manifest was changed.

The explicit performance player adds per-entry cancellation and retirement.
An interrupted pre-takeoff delighted response stays grounded; an airborne one
blends continuously to the requested state. A new gesture has its own takeoff
policy, while interrupted held work can resume its original phase. The
Interrupted response inspector control exercises both cases plus working and
listening. `fox-anatomy-performance-check.ts` covers eleven interruption times,
pose/velocity continuity, resumption, cadence, rapid retirement and reset;
browser review covers 146 frames and actual controls. This does not complete
physical prop exits, all-state contact/occlusion, or live routing.

The Searching motion study uses the new isolated `search-magnifier.png` from
built-in Image Gen. `prompts-search-magnifier.json` records the exact prompt;
`search-rig.json` records grip, paw registration and size. The original Fox
artwork is unchanged. A rigid prop frame follows the skinned right paw tangent,
with fingers in front of the handle. The two uneven sweeps, inspection pause
and recheck have separate head/chest timing and downward gaze. The lens keeps
actual alpha and does not pretend to show a real search result.
`fox-searching-check.ts` covers source alpha, rigid dimensions, grip attachment,
painted bounds, scan direction, rest and reduced motion. Shared checks include
nine finite clips, 358 rendered samples and 504 interrupted parameter cases.
Searching hold retains the grip/prop while scan and inspection repeat without
replaying the entrance. Search and interrupt previews brief resumption and
fresh entry after retirement using the shared performance player. Two-minute
hold and 150 interruption checks include this state; desktop/narrow/HUD and
reduced-motion browser review is recorded in the animation document.
Physical prop arrival/departure, transition clearance and production routing
remain unfinished; the prop visibly fades during transitions, not a final
physical stowing performance.

The `working` inspector study uses `working-device.png`, generated with built-in
Image Gen from the existing working key pose; its exact edit prompt is in
`prompts-working-device.json`. `working-rig.json` owns registration, screen
ownership, contact pose and authored tap timing. The keyboard/base is behind
the independent paws; the screen is in front. Original Fox face pixels are
unchanged. `node scripts/fox-working-check.ts` checks the two uneven tap phrases,
inspection pause, rest endpoints and reduced motion. The shared render check
now covers 292 samples and the transition parameter check covers 294 cases.
Browser review verified exact two-layer prop reconstruction, disposal,
play/pause/scrub, desktop/narrow layouts and the 144px HUD. The resulting pose
has since had its right elbow/wrist direction corrected: the paw returns to
the keyboard interior instead of gripping the screen edge. Projected fingertip
lanes are regression-checked, but detailed contact still needs refinement.
Working hold now enters once and sustains two uneven operation phrases with
an inspection pause; it never replays the finite clip exit. Two-minute 60Hz
sampling, cycle-seam velocities and 100 hold interruptions pass. The inspector
preserves workstation and gaze channels. Browser review covers 72 hold renders
and 64 working transition samples for clipping, not complete contact acceptance.
The prop still fades in/out; physical prop handling and live promotion remain
incomplete.

1. Author entrance/exit and isolated foreground limb/prop layers. Preserve the
   face and contact points without whole-image crossfading or ghost hands.
2. Improve reading gaze and page-turn, pencil/paw articulation, and chin/neck
   contact through the full motion range; inspect at HUD scale and larger.
3. Complete the remaining state artwork/animation, using the catalog and shared
   style, then implement interruptible continuous transitions and event routing.
4. Validate all states and transition categories, real foreground task mapping,
   drag/voice priorities, reduced motion, performance, and World/desktop parity.

The live app continues to use the approved baseline renderer. None of these
drafts is registered in the live manifest yet. A key pose, passing mesh check or
catalog entry does not count as a completed state. The full goal remains active.
