# World and environment design

The world is a fixed-view 2.5D composition, not a freely orbiting 3D scene. It fills
the window independently of HUD content. Image quality and believable spatial
relationships matter more than whether an object began as a model or painting.

## Place and identity

Home plus five default regions organize the world: Work, Social, Life, Games and
Entertainment. User names, landmark themes, membership and pinned placements are independent.
Stable IDs survive renaming, artwork replacement and account changes.

Each region provides named supported ground for devices. Capacity follows real space;
never stack overflow over water, roofs or paths. The shelf can expose more Applets
than the ground has room for. Selection, installation, connection and visible placement
are different state dimensions.

## Composition contract

The logical design reference is 1920 × 1080. Texture resolution and renderer density
are independent. Window changes use one shared camera transform for plates, landmarks,
devices, hit targets and labels. HUD anchors to the viewport without shrinking World.

Reserve surrounding terrain for Region framing and readable ground for devices.
Unify camera angle, material language, optical scale, ground anchor, shadows and
occlusion. Transparent padding is not an object's footprint. More pixels alone do
not create new detail or fix mismatched perspective.

## Environment and motion

Day/night variants share geometry. Weather, sky and lighting follow explicit state;
without location, sky positions are decorative rather than falsely precise. Request
location through a deliberate weather/setup action, not repeated permission prompts.

Subtle water, smoke, device and companion motion follows real state and reduced-motion
preferences. Static painted shadows cannot physically track the sun through tinting.
General foreground occlusion, independent vegetation and walking characters require
explicit implementation; fixed camera does not make them automatic.

Audio is a global, visible and controllable state. Music, ambience and podcasts follow
the shared exclusive-channel policy. Voice capture ducks audio and restores the prior
state; restart must not unexpectedly autoplay a remote stream.

## Asset and rendering acceptance

Use the [Style Pack](../resources/styles/builtin/README.md) as the single visual authority.
Review overview and maximum close view with actual devices, narrow windows, day/night,
alpha edges and contact shadows. Keep text, records and controls out of paintings.
Performance measurements name the host, viewport and scenario; a microbenchmark is
not a universal frame-rate guarantee.

[Environment/placement implementation](../ui/world/ENVIRONMENT.md),
[composition](../ui/world/COMPOSITION.md) and
[production mechanics](../resources/styles/builtin/PRODUCTION.md) own technical details.
