# Releasing from GitHub Actions

This repository builds, signs and publishes the desktop apps itself, from [the Release workflow](../.github/workflows/release.yml). The release machines 01 and 02 test those builds for Alpha and Beta and promote them; they no longer build their own.

## Channels

The channels are the in-app update channels ([update-channel.ts](../core/distribution/update-channel.ts)). Each one adds tests to the one before it (owner decision 2026-10-09):

| Channel | Tests | Where, how long | What ships |
| --- | --- | --- | --- |
| Dev | The Dev tests: the pull request checks again (`check:pr`, the fast tests, the operational checks), no UI test | GitHub Actions on Linux, within three minutes, on every push to `main` (documentation-only pushes excepted); a newer push cancels an older commit's run | The newest commit's signed, notarized build, once the Dev tests passed |
| Alpha | The Dev tests, the quick UI checks (`test:ui:quick`) and the platform tests (Electron, iOS on the Mac, Android on Windows, Harness and Hermes) | The release machines, 01 (Windows) and 02 (Mac), within 20 minutes, on each new Dev build | That Dev build, once both machines passed |
| Beta | Alpha's tests and the whole UI suite (`test:ui`) | 01 and 02, every night at 1:00 Pacific, within an hour | The newest Alpha build, once both machines passed; the public download and the default channel |
| GA (Production) | — | Not open on the desktop yet; a maintainer decides | — |

Promotion never rebuilds. It names the exact installer and signed Sparkle item that the Dev build produced in another channel's feed, so what was tried on Dev is byte for byte what ships.

Everything lives on this repository's GitHub Releases:

| Release | What it holds |
| --- | --- |
| `v<label>` | One per Build: the Mac DMG, the Windows installer and their checksums, and the Microsoft Store MSIX with its record (`-store.msix`, `.msix.json`) when it built. A prerelease until the Build reaches Beta, which makes it the latest release. |
| `channel-dev`, `channel-alpha`, `channel-beta` | Each channel's update feeds, replaced in place so their addresses never change: `appcast-dev.xml` and `windows-dev.json`; `appcast-alpha.xml` and `windows-alpha.json`; `appcast.xml`, `appcast-intel.xml` (with history) and `windows-preview.json`. |
| `staging-<channel>` | The same feeds for a channel that is not live yet. |

[Channels.json](../platform/electron/distribution/Channels.json) lists the live channels. A channel not on the list publishes to its staging release, which nothing reads. Dev and Alpha are live (Alpha since 2026-10-09, owner decision, after Build 4028 passed both release machines); a pull request adds Beta once its nightly runs promote builds. Apps already installed read their feeds from the website's `/downloads/` addresses, which forward to these releases. Release assets can be downloaded without signing in only once the repository is public.

## Tests and failures

The Dev tests run in [the Release workflow](../.github/workflows/release.yml) as its `checks` job, which reuses the pull request workflow ([architecture.yml](../.github/workflows/architecture.yml)). The Mac and Windows builds start beside them and publish to Dev only once they passed (`node scripts/ci-release.mjs dev-tests`).

A release machine records a passed channel on the commit as the status `worldlet/alpha-mac`, `worldlet/alpha-windows`, `worldlet/beta-mac` or `worldlet/beta-windows`, and promotion checks for both platforms' status before it publishes.

A failure opens one Issue per channel, platform and set of failing gates or jobs, labelled `test-failure`, `stage:dev|alpha|beta` and `platform:linux|mac|windows`, with the run ([ci-failure-report.mjs](../scripts/ci-failure-report.mjs)). The same failure again adds a comment instead of another Issue, and the next pass closes it. A cloud AI session fixes these Issues with ordinary pull requests.

Gates that need a signed-in Codex CLI (`test:onboarding`, `test:agent:local`, `test:ui:review`) report SKIP where no Codex is signed in, and `test:android` stays advisory.

## Build numbers

Build = 4000 + the commit's position on `main` (`git rev-list --count`). The offset keeps every build of this repository above the builds the release machines published before it, so installed apps keep updating. The label is `YYYY.MMDD.BUILD`, the date being the commit's day in Pacific time; the native version omits the leading zero of the month (`2026.1008.4012`). [scripts/ci-release.mjs](../scripts/ci-release.mjs) computes it and hands it to the build as `WORLDLET_RELEASE_MANIFEST` ([build-info.ts](../scripts/build-info.ts)), so no release commit is made.

## What a build does

- **Mac** (`macos-15`): [ci-build.sh](../platform/electron/distribution/mac/ci-build.sh) packages one universal app signed with the Developer ID certificate, puts it in a signed DMG, notarizes the DMG with an App Store Connect API key, staples it, and writes the Sparkle item signed with the update key. Apple notarizes the app inside the DMG in the same submission, so there is one notarization wait instead of two.
- **Windows** (`windows-2025`): `npm run installer:windows`, the unsigned NSIS installer the Windows updater already reads, then the Microsoft Store MSIX of the same commit (`windows-msix.ts`, the runner's Windows SDK). Release machine 01 submits that MSIX in Partner Center once the Build reaches Beta. A failed MSIX never holds the installer back.
- Both then publish to Dev with `node scripts/ci-release.mjs publish`, which uploads the installer and its checksum to the Build's release, then replaces the channel's feed, and refuses to replace a channel's newer build. A Dev build whose commit is behind a later push that changed a workflow is skipped: GitHub does not let the workflow's token tag a commit whose workflows differ from `main`'s, and that later push publishes its own, newer Dev build.

How long it takes: Dev cannot be ready three minutes after a push. Building the universal app with its Chromium engine takes several minutes on a hosted Mac, and Apple's notarization usually takes a few minutes more, sometimes much longer. The Build number is fixed the moment the commit lands; the job summary of each run records how long each part took.

## Secrets

Signing and publishing secrets live only in the repository's `release` environment, restricted to `main`. Pull requests never run this workflow, and a fork's run has no secrets. Maintainers set them in Settings › Environments › release:

| Secret | What it is |
| --- | --- |
| `MAC_CERTIFICATE_P12` | The Developer ID Application certificate with its private key, exported as .p12 and base64-encoded |
| `MAC_CERTIFICATE_PASSWORD` | The password of that .p12 |
| `APPLE_API_KEY_P8` | The App Store Connect API key used for notarization (the text of `AuthKey_<id>.p8`) |
| `APPLE_API_KEY_ID` | That key's ID |
| `APPLE_API_ISSUER_ID` | The key's issuer ID |
| `SPARKLE_PRIVATE_KEY` | The Ed25519 update key whose public half is `publicKey` in [Updates.json](../platform/electron/distribution/Updates.json) (`generate_keys -x`) |
| `GOOGLE_OAUTH_CLIENT_JSON` | The Google Desktop OAuth client registration bundled into the app |
| `POSTHOG_PROJECT_KEY` | The PostHog project key that the build writes into `Analytics.json` (kept empty in this repository), so crashes and usage events reach PostHog |

Publishing to GitHub Releases uses the workflow's own token, so it needs no secret. Windows installers are unsigned today, so there is no Windows signing secret.

## Checks

`node scripts/ci-release-check.mjs` (part of `npm run check:pr`) checks build numbers, channel keys, feed rewriting, Sparkle signature verification, publication order, that a promotion requires both release machines' pass for its channel, that a Dev build waits for the Dev tests and that the workflow never runs for pull requests or reads secrets outside the `release` environment. `node scripts/ci-failure-report-check.mjs` checks how test results open, update and close Issues.
