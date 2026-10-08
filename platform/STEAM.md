# Steam launch preparation

Status checked September 25, 2026. This is a draft, not a published store page.

## Current gates

| Item | Verified status | Next action |
| --- | --- | --- |
| Partner | Clockless Inc. | Keep the legal entity consistent |
| Steam Direct fee | Paid; dashboard shows one available App Credit | Do not pay again |
| Bank details | Saved | No change required |
| Tax identity | W-9 submitted; requested incorporation certificate and government ID front/back subsequently uploaded successfully on September 25 | Await third-party KYC review, up to 10 business days after supplemental documents. Upload success is not approval. Respond if further material is requested |
| App creation | Not created; account onboarding awaits identity verification | Redeem the existing credit when onboarding permits app creation |
| Software eligibility | Request submitted; not approved | Await [Steamworks ticket HT-9PBJ-35JH-5XBW](https://help.steampowered.com/en/wizard/HelpRequest/HT-9PBJ-35JH-5XBW), requesting admission under Business & Office |
| Coming Soon | Not created or published | Create product, complete store checklist, submit for review, then publish |
| Wishlists | Not available yet | Share the public store URL after Coming Soon publication |

The product creation dialog lists Business & Office under Software Application. The linked non-game software support page says new proposals require individual review and generally limits admission to selected content-creation software. Category selection is not approval. Describe Worldlet truthfully as productivity software; do not classify it as a game to bypass admission.

## Proposed store identity

- Product: Worldlet
- Developer / publisher: Clockless Inc.
- Product type: Software Application
- Proposed category: Business & Office, subject to Valve approval
- Public release date: Coming soon; no specific date promised
- Website: https://worldlet.ai
- Pricing: undecided; no price or unlimited AI entitlement promised

## Short description draft

Your personal AI assistant, in a world you can see. Meet Fox, bring your mail, calendar and everyday tools into a cozy desktop world, and see what needs your attention. Talk naturally, explore your Applets, and keep your work in context.

## About draft

### A small world for your everyday work

Worldlet brings a personal AI assistant and your everyday tools into an interactive miniature world on your computer.

### Meet Fox

Talk to your companion about what you want to do. Fox can help with connected content and the Applet you are viewing, with clear permission boundaries for actions.

### Your tools, together

Open mail, calendars, notes and websites through Applets. Move between places without losing the context of your conversation.

### See what needs attention

The Attention Center brings upcoming events, tasks and useful updates together, with links back to their source.

### Know what you are connecting

Connected services may require their own accounts and authorization. AI features require model access and network connectivity. Model access terms, included usage and any additional charges must be finalized and disclosed before this description is submitted. Do not promise unlimited use or entirely offline operation.

## Remaining store materials

- Actual application screenshots: world overview, Mail and Attention Center, Calendar, browser Focus, and Fox conversation. Use fictional content; never upload personal mailbox or account data.
- Capsule and library artwork using the existing approved Worldlet logo and visual style, exported to the sizes required by the current Steam upload form.
- A short actual-use trailer; avoid depicting unimplemented functionality as available.
- Supported languages and tested operating-system requirements. Mac is available; Windows remains a preview in repository documentation and needs release acceptance before being promised.
- Support contact, privacy-policy URL and any applicable EULA verified against the live website.
- Content survey with accurate disclosure of AI-generated artwork and runtime AI functionality, based on the exact questions in Steamworks.
- Review access instructions that let Valve assess the app without access to private user accounts.

## Publication sequence

### Windows delivery engineering

Steamworks runtime API integration is optional for Steam distribution. The first
Worldlet Steam build uses SteamPipe delivery and Steam-managed updates without
adding Steam API dependencies to the shared UI, core, Harness or website build.
No achievements, Steam account entitlement, overlay, Workshop or Cloud support
is claimed. Never sync the whole profile, OAuth grants, DPAPI data or mail cache
through Steam Cloud; any later portable-settings sync needs its own design.

Use the same application source with channel-specific packaging: website EXE
installer, Steam loose-file depot, and Microsoft Store MSIX. Steam installs the
depot directly; do not upload the website installer as the launch executable.
Windows Steam metadata disables website update checks and direct update bridge
requests, even when launched outside Steam. Actual MSIX identity takes precedence.

After receiving the real App ID and Windows Depot ID:

```powershell
$env:WORLDLET_DISTRIBUTION_CHANNEL = 'steam'
node scripts/windows.ts package
node scripts/windows-steam.ts <AppID> <WindowsDepotID>
```

The generator requires a clean current self-contained candidate and emits a
unique `dist/windows-steam/candidate-*/app.vdf`, `depot.vdf` and source metadata.
It rejects development Steam IDs/overrides and common credential files. Its
`Preview=1` configuration is a SteamPipe dry run, not an uploaded build. Use the
official SDK ContentBuilder with an authorized build account; never put a
password in repository scripts. Keep the candidate payload unchanged through
preview/upload. Set `Preview=0` only for the intended upload. No `SetLive` is
generated, so uploading does not automatically activate a branch.

Configure Windows x64 launch to `Worldlet.exe` with the depot root as working
directory. Test install, launch, Google sign-in, background runtime downloads,
restart, Steam update/data retention and website/Store co-installation on a
private branch before review. Existing fixtures do not prove Steam-client
acceptance. App/depot IDs, SDK download and real Steam upload remain pending.

References: [SDK scope](https://partner.steamgames.com/doc/sdk),
[API integration](https://partner.steamgames.com/doc/sdk/api),
[SteamPipe](https://partner.steamgames.com/doc/sdk/uploading).

1. Complete tax onboarding and request software eligibility confirmation.
2. Create Worldlet using the paid credit.
3. Complete and review the actual store checklist; submit the store page.
4. Publish Coming Soon once approved. This enables a public wishlist destination.
5. Upload and test Steam builds independently of the store-page preparation.
6. Release only after approvals and required waiting periods. Steam documents a 30-day wait after paying the fee and at least two weeks of public Coming Soon visibility; those periods may overlap.

Sources: [non-game software admission](https://help.steampowered.com/en/wizard/HelpWithPublishing?issueid=925), [Steam Direct](https://partner.steamgames.com/steamdirect), [store review](https://partner.steamgames.com/doc/store/review_process).

## Tax submission evidence

On September 25, 2026 at 17:30 UTC, the Steamworks return page displayed “Your tax status has been updated” and “Identity Verification Pending.” Submission succeeded; verification has not passed yet. The dashboard states up to 10 business days, no edits during review, and that Steamworks Support cannot expedite the third-party review. The earlier KYC error is no longer the active blocker; do not send the prepared obsolete failure report. No tax identifier or signed tax form is stored in this repository.

## Supplemental verification documents

On September 25, the official Tax Identity Solutions file request confirmed successful uploads of the company incorporation certificate and the authorized signer’s government ID front/back. Clockless Inc. was incorporated September 8, 2026; the notice requires Good Standing only for companies over 12 months old. No identity images, identifiers or private upload links are stored here. KYC approval and software eligibility remain pending. See the [distribution dashboard](distribution/index.html).
