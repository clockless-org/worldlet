# Releasing from GitHub Actions

This repository builds, signs and publishes the desktop apps itself, from [the Release workflow](../.github/workflows/release.yml). It replaces the release machines described in [Release guidelines](RELEASE-GUIDELINES.md) once the comparison runs below match; until then both run side by side.

## Channels

The channels are the in-app update channels ([update-channel.ts](../core/distribution/update-channel.ts)):

| Channel | What it gets | How |
| --- | --- | --- |
| Dev | Every push to `main` (documentation-only pushes excepted) | Automatic: build, sign, notarize, publish to Dev |
| Alpha | A Dev build a maintainer promotes | Run the workflow with `channel: alpha` and the Build |
| Beta | An Alpha build a maintainer promotes; the public download and the default channel | Run the workflow with `channel: beta` and the Build |
| Production | Not open on the desktop yet | — |

Promotion never rebuilds. It republishes the exact installer and its signed Sparkle item that the Dev build produced (kept as workflow artifacts for 30 days), so what was tried on Dev is byte for byte what ships.

[Channels.json](../platform/electron/distribution/Channels.json) lists the channels that publish to their live feeds. A channel not listed publishes under `ci-staging/` in the release bucket, where installed apps and the download page never look. That is how CI releases run beside the release machines before they take over: Alpha and Beta are added to the list in a pull request when CI takes them over.

| Channel | Installers | Mac feed | Windows manifest |
| --- | --- | --- | --- |
| Dev | `dev/` | `appcast-dev.xml` | `windows-dev.json` |
| Alpha | `alpha/` | `appcast-alpha.xml` | `windows-alpha.json` |
| Beta | bucket root | `appcast.xml`, `appcast-intel.xml` (with history) | `windows-preview.json` |

Beta promotions also create the GitHub Releases `v<label>` (Mac) and `windows-v<label>` on the source commit, with the installers attached.

## Build numbers

Build = 4000 + the commit's position on `main` (`git rev-list --count`). The offset keeps every build of this repository above the builds the release machines published before it, so installed apps keep updating. The label is `YYYY.MMDD.BUILD`, the date being the commit's day in Pacific time; the native version omits the leading zero of the month (`2026.1008.4012`). [scripts/ci-release.mjs](../scripts/ci-release.mjs) computes it and hands it to the build as `WORLDLET_RELEASE_MANIFEST` ([build-info.ts](../scripts/build-info.ts)), so no release commit is made.

## What a build does

- **Mac** (`macos-15`): [ci-build.sh](../platform/electron/distribution/mac/ci-build.sh) packages one universal app signed with the Developer ID certificate, puts it in a signed DMG, notarizes the DMG with an App Store Connect API key, staples it, and writes the Sparkle item signed with the update key. Apple notarizes the app inside the DMG in the same submission, so there is one notarization wait instead of two.
- **Windows** (`windows-2025`): `npm run installer:windows`, the unsigned NSIS installer the Windows updater already reads.
- Both then publish to Dev with `node scripts/ci-release.mjs publish`, which uploads the installer and its checksum, then the channel's feed, and refuses to replace a channel's newer build.

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
| `R2_ENDPOINT` | The release bucket's R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | An R2 API token's access key, scoped to the release bucket |
| `R2_SECRET_ACCESS_KEY` | That token's secret |

Windows installers are unsigned today, so there is no Windows signing secret.

## Checks

`node scripts/ci-release-check.mjs` (part of `npm run check:pr`) checks build numbers, channel keys, feed rewriting, Sparkle signature verification, publication order and that the workflow never runs for pull requests or reads secrets outside the `release` environment.
