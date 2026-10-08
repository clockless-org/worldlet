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

Promotion never rebuilds. It names the exact installer and signed Sparkle item that the Dev build produced in another channel's feed, so what was tried on Dev is byte for byte what ships.

Everything lives on this repository's GitHub Releases:

| Release | What it holds |
| --- | --- |
| `v<label>` | One per Build: the Mac DMG, the Windows installer and their checksums. A prerelease until the Build reaches Beta, which makes it the latest release. |
| `channel-dev`, `channel-alpha`, `channel-beta` | Each channel's update feeds, replaced in place so their addresses never change: `appcast-dev.xml` and `windows-dev.json`; `appcast-alpha.xml` and `windows-alpha.json`; `appcast.xml`, `appcast-intel.xml` (with history) and `windows-preview.json`. |
| `staging-<channel>` | The same feeds for a channel that is not live yet. |

[Channels.json](../platform/electron/distribution/Channels.json) lists the live channels. While the release machines still run Alpha and Beta, CI publishes those to their staging releases, which nothing reads, so both can run side by side; a pull request adds a channel to the list when CI takes it over. Apps already installed read their feeds from the website's `/downloads/` addresses, which forward to these releases. Release assets can be downloaded without signing in only once the repository is public.

## Build numbers

Build = 4000 + the commit's position on `main` (`git rev-list --count`). The offset keeps every build of this repository above the builds the release machines published before it, so installed apps keep updating. The label is `YYYY.MMDD.BUILD`, the date being the commit's day in Pacific time; the native version omits the leading zero of the month (`2026.1008.4012`). [scripts/ci-release.mjs](../scripts/ci-release.mjs) computes it and hands it to the build as `WORLDLET_RELEASE_MANIFEST` ([build-info.ts](../scripts/build-info.ts)), so no release commit is made.

## What a build does

- **Mac** (`macos-15`): [ci-build.sh](../platform/electron/distribution/mac/ci-build.sh) packages one universal app signed with the Developer ID certificate, puts it in a signed DMG, notarizes the DMG with an App Store Connect API key, staples it, and writes the Sparkle item signed with the update key. Apple notarizes the app inside the DMG in the same submission, so there is one notarization wait instead of two.
- **Windows** (`windows-2025`): `npm run installer:windows`, the unsigned NSIS installer the Windows updater already reads.
- Both then publish to Dev with `node scripts/ci-release.mjs publish`, which uploads the installer and its checksum to the Build's release, then replaces the channel's feed, and refuses to replace a channel's newer build.

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

Publishing to GitHub Releases uses the workflow's own token, so it needs no secret. Windows installers are unsigned today, so there is no Windows signing secret.

## Checks

`node scripts/ci-release-check.mjs` (part of `npm run check:pr`) checks build numbers, channel keys, feed rewriting, Sparkle signature verification, publication order and that the workflow never runs for pull requests or reads secrets outside the `release` environment.
