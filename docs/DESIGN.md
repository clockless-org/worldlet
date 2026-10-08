# Product interaction design

Worldlet is a useful application presented as a small dimensional world. Information,
readability and immediate control take priority over decoration and game mechanics.

## Spatial and presentation hierarchy

World → Region → Applet describes place. **Peek → Open → Focus** describes an Applet's
presentation; it is independent of connection, activity and implementation readiness.

| State | User experience |
| --- | --- |
| Peek | Grounded device in its Region, with truthful state and subtle hover feedback |
| Open | The same device unfolds useful, selectable native contents |
| Focus | Selected content or an actual website becomes readable at left; device/Fox stay at right |

Website Applets may go directly Peek → Focus. Open is opt-in when implemented and
accepted, never an empty intermediate enlargement. Implementation kinds such as web,
scene and panel are not additional product states.

## Navigation

World always covers the window; HUD never compresses it. Camera direction is fixed,
with system-controlled region/device framing. A continuous approach preserves device
identity. Back means the actual entry view, including direct links; it must not insert
a Region or Open stage the user never visited. This is the design contract, not a
claim that every current transition has passed acceptance.

Exposed scenery and Back dismiss one level. Content clicks and drags do not dismiss.
Focus places the reading/browser surface in roughly the left two-thirds. Exiting a
website unloads its page/media, preserving appropriate account session storage.

## HUD and visual language

One built-in [Style Pack](../resources/styles/builtin/README.md) owns the visual language.
Use restrained painted surfaces, legible typography, quiet motion and soft backing.
Context title names the current place once. Region and generic Applet names have no
emoji/logo fallback; branded Applets retain genuine publisher identity. Inside an Applet
the title centers over the left two-thirds, with Back on its left and the Applet's own
controls on its right, all controls in the darker frosted material of Fox's round controls.

Attention Center is vertically centered and content-sized; empty means invisible.
Fox remains one anchored group with input, dialogue, status and contextual actions.
Settings and available update belong at lower left; version information stays quiet.
Long reading/catalogs use one bounded scroll area with stable navigation.

## Fox and actions

Click to type, hold to dictate. Continuous input, drafts and conversation survive
ordinary view changes. Opening an Applet does not force a scripted greeting. Fox's
responses use real model context and remain concise, helpful and truthful.

Progress belongs in the open bubble, or the passive caption when collapsed; the
name badge remains a name. Content actions are consistent body-size bold underlined
text. Suggestions do not execute arbitrary model text. Read-only native originals
leave task changes to Fox; websites retain their own controls and permission gates.

## First use and accessibility

Current setup uses Google authorization followed by Applet selection; entry does not
wait for background source processing. No retired model tour or local-model fallback.
Permission denial, cancellation, failure and retry must remain understandable.

Keyboard focus, text enlargement, reduced motion and retained reading position are
required. Animation cannot delay input or invent task success.

[Detailed interaction contracts](../ui/components/INTERACTION.md),
[first-use behavior](../ui/onboarding/README.md) and
[Applet authoring](../ui/applets/DESIGN-GUIDE.md) own component-level details.
