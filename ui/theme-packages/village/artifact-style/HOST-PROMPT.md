# Prompt for a host generator

Give the generator this prompt together with [STYLE.md](STYLE.md), [manifest.json](manifest.json), the preferred reference picture, the real content for this card and a description of the host's capabilities. Pass the pictures as actual visual input; a file name is no substitute for seeing them.

---

You are generating one complete, usable Artifact for Worldlet's Village world. Design and produce the whole card directly; do not ask the caller to fill fields into a fixed template.

**Visual target**: the attached outing Artifact is the preferred reference, and the recipe Artifact is a second instance of the same design language. Follow STYLE.md. Later simplified HTML cards are not the target. Keep the original's layered paper, a large content illustration blended into the paper, serif typography, brass details and buttons with thickness. Do not make a beige web form, and do not make an ornamental painting full of borders.

**Design from the content**: first decide what matters in the information, then choose the layout. A schedule, a recipe, a comparison, a cost or an explanation can each use a different composition. You decide the HTML structure, local styles, section organisation and illustration placement; you do not need the existing block template. Keep the card's own theme language and a clear reading order.

**Illustration**: use the relevant materials provided, or add a separate illustration through an image capability the host provides. Illustrations use the Village's soft storybook 3D style, light from the top left, edges fading naturally into the paper, and no dynamic text or controls. The illustration explains this content; do not repeat bridges and mountains unrelated to it. Without an image capability, never claim you generated a picture; finish the card with the resources you have and fine typography.

**Real content and actions**: titles, body, dates, figures, lists, tables and controls are all HTML. Never use a whole rendered picture as the interface or cover it with transparent hot spots. The content is already complete. Quantity changes compute correctly; checklists keep their state; options change the matching content; every visible button has a clear effect. External actions go only through the host capabilities actually given.

**Boundaries**: produce only the card. The World map, the companion, the chat input and navigation are the host's and are not copied into the card. Respect the given usable rectangle and reserved areas. Do not read or change the parent page, accounts or credentials; do not add network requests or remote dependencies. Use the isolation, event and state interfaces the host gives, and invent no API. Do not make up missing content; without the capability to act, mark the card as a draft or preview.

**Output**: follow the complete-page delivery protocol the host provides for this task, delivering showable content, HTML and styles, material dependencies and the interaction and state information needed, not just a picture, a design note or a template to fill. If no page protocol is provided, deliver a locally openable `artifact.html` with its resources and list the host actions that are not wired; never claim production integration is done.

**Before delivering**: render at the host's target size and check. Compare illustration weight, paper thickness, text hierarchy, control material and spacing with the first reference. Confirm nothing is clipped, text is selectable, controls work by click and keyboard, figures update correctly and nothing crosses the boundary. Fix problems before delivering.

The content, available size, material paths and capabilities for each task come from the host with that task and are not preset by this prompt.
