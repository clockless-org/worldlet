# Releasing from GitHub Actions

The desktop apps are built, signed and published to this repository's GitHub Releases with its own release scripts. The release machines 01 (Windows) and 02 (Mac) build the Dev packages, test them for Alpha and Beta and promote them (owner decision 2026-10-10: they build much faster than GitHub's runners, and not every commit needs a package). GitHub's runners build no package. [The Release workflow](../.github/workflows/release.yml) runs the Dev tests on every push and carries out promotions.

## Channels

The channels are the in-app update channels ([update-channel.ts](../core/distribution/update-channel.ts)). Each one adds tests to the one before it (owner decision 2026-10-09):

| Channel | Tests | Where, how long | What ships |
| --- | --- | --- | --- |
| Dev | The Dev tests: the pull request checks again (`check:pr`, the fast tests, the operational checks) and the fastest UI checks (`test:ui:pr`) | GitHub Actions on Linux, within five minutes, on every push to `main` (documentation-only pushes excepted) | Nothing to users (owner decision 2026-10-10: only Alpha packages are needed). 01 or 02 builds the signed, notarized package of `main`'s newest commit when it is free and, once that commit's Dev tests passed, uploads it to the Build's release for Alpha to test, with its feeds on `staging-dev`, which nothing reads; a build that started always runs to the end. The Dev app on the development Mac follows `main` from its own checkout. |
| Alpha | The Dev tests, the quick UI checks (`test:ui:quick`) and the platform tests (Electron, iOS on the Mac, Android on Windows, Harness and Hermes) | The release machines, 01 (Windows) and 02 (Mac), within 20 minutes, on each new Dev build | That Dev build on each platform once that platform's machine passed it; each platform moves on its own (owner decision 2026-10-10) |
| Beta | Alpha's tests and the whole UI suite (`test:ui`) | 01 and 02, every night at 1:00 Pacific, within an hour | On each platform, the newest Alpha build that platform's machine passed that night; the public download and the default channel |
| GA (Production) | — | Not open on the desktop yet; a maintainer decides | — |

Promotion never rebuilds. It downloads the Build's installers and records from its release (`node scripts/ci-release.mjs fetch`) and names the exact installer and signed Sparkle item that the Dev build produced in another channel's feed, so what was tried on Dev is byte for byte what ships. Builds made on GitHub's runners before 2026-10-10 have no records on their release and are taken from their Actions artifacts instead.

Everything lives on this repository's GitHub Releases:

| Release | What it holds |
| --- | --- |
| `v<label>` | One per Build: the Mac DMG, the Windows installer, the Linux service tarballs (`worldlet-server-<label>-linux-x64.tar.gz`, `-arm64`), their checksums and records (`.appcast.xml`, the Sparkle item; `.json`, the Windows record; `worldlet-server-<label>-linux.json`, the Linux record; `.release.json`, the identity), and the Microsoft Store MSIX with its record (`-store.msix`, `.msix.json`) when it built. A prerelease until the Build reaches Beta, which makes it the latest release. |
| `channel-alpha`, `channel-beta` | Each channel's update feeds, replaced in place so their addresses never change: `appcast-alpha.xml`, `windows-alpha.json` and `linux-alpha.json`; `appcast.xml`, `appcast-intel.xml` (with history), `windows-preview.json` and `linux.json`, which the [one-line installer](../platform/install/README.md#linux) reads on Linux. |
| `staging-<channel>` | The same feeds for a channel that is not live yet. |

[Channels.json](../platform/electron/distribution/Channels.json) lists the live channels. A channel not on the list publishes to its staging release, which nothing reads. Alpha and Beta are live (Dev was live from 2026-10-08 to 2026-10-10, when the owner decided only Alpha packages are needed; Alpha since 2026-10-09 after Build 4028 passed both release machines, Beta the same day after Build 4034 passed the nightly run on both; owner decisions). When a channel is added, the release machines promote the newest build that already passed that stage to it. Apps already installed read their feeds from the website's `/downloads/` addresses, which forward to these releases. Release assets can be downloaded without signing in only once the repository is public.

## Tests and failures

Only smoke checks hold a release back (owner decision 2026-10-10: the interface still changes a lot, so Alpha and Beta wait only on the big things). On each platform these block: the app starts (`test:electron`), the World draws, Fox answers and an Applet opens (`test:ui:smoke`), first-run setup reaches the World (`test:onboarding`, Mac), Fox answers through a real local Agent (`test:agent:local`), and the downloaded installer installs, opens and updates (the release machine's package smoke); Beta adds the one-line install. [scripts/gate.mjs](../scripts/gate.mjs) lists them as `blockingGates`, and the release machines read that list from `main`, so a change applies at once. Every other test in the table above still runs and reports: its failure opens an Issue marked "reports only" and is fixed like any other, but the platform is promoted.

The Dev tests run in [the Release workflow](../.github/workflows/release.yml) as its `checks` job, which reuses the pull request workflow ([architecture.yml](../.github/workflows/architecture.yml)). A release machine publishes its package to Dev only once that commit's Dev tests passed.

A release machine records a passed channel on the commit as the status `worldlet/alpha-mac`, `worldlet/alpha-windows`, `worldlet/beta-mac` or `worldlet/beta-windows`, and promotion checks that platform's status before it publishes it. Each platform is promoted on its own (`platform` input of the Release workflow; owner decision 2026-10-10), so Mac and Windows can serve different Builds.

A failure opens one Issue per channel, platform and set of failing gates or jobs, labelled `test-failure`, `stage:dev|alpha|beta` and `platform:linux|mac|windows`, with the run ([ci-failure-report.mjs](../scripts/ci-failure-report.mjs)). The same failure again adds a comment instead of another Issue, a different failure on the same channel and platform closes the older Issue as superseded, so at most one stays open per channel and platform, and the next pass closes it. A cloud AI session fixes these Issues with ordinary pull requests.

Gates that need a signed-in Codex CLI (`test:onboarding`, `test:agent:local`, `test:ui:review`) report SKIP where no Codex is signed in, and `test:android` stays advisory.

## Build numbers

Build = 4000 + the commit's position on `main` (`git rev-list --count`). The offset keeps every build of this repository above the builds the release machines published before it, so installed apps keep updating. The label is `YYYY.MMDD.BUILD`, the date being the commit's day in Pacific time; the native version omits the leading zero of the month (`2026.1008.4012`). [scripts/ci-release.mjs](../scripts/ci-release.mjs) computes it and hands it to the build as `WORLDLET_RELEASE_MANIFEST` ([build-info.ts](../scripts/build-info.ts)), so no release commit is made. Every commit on `main` gets its Build as a git tag, `v<label>`, the moment it lands ([tag.yml](../.github/workflows/tag.yml), owner request 2026-10-11), whether or not a package is built from it; a packaged build's release reuses that tag. When a Build goes out on Alpha or Beta (and GA once it is a channel), its commit also gets that stage's tag, `alpha/v<label>` or `beta/v<label>` (`publish` in [ci-release.mjs](../scripts/ci-release.mjs)); a tag GitHub refuses is reported and never fails the release. Android's `versionCode` and the Dev app use the same Build.

## What a build does

A release machine takes `main`'s newest commit whenever it has no Beta or Alpha run to do and that commit has no Dev package for its platform yet, never in the half hour before Beta. It builds in its own checkout with the steps below and its own keys (02 notarizes through a notarytool keychain profile, `NOTARY_PROFILE`), and publishes with its own GitHub sign-in. A newer commit never stops a build that has started; the next build takes the newest commit then.

- **Mac**: [ci-build.sh](../platform/electron/distribution/mac/ci-build.sh) packages one universal app signed with the Developer ID certificate, puts it in a signed DMG, notarizes the DMG, staples it, and writes the Sparkle item signed with the update key. Apple notarizes the app inside the DMG in the same submission, so there is one notarization wait instead of two.
- **Linux**: 02 also packages the headless service of the same commit for Linux (`npm run package:linux`, [the Node host's package](../platform/node/README.md#package)) and publishes it with `node scripts/ci-release.mjs publish --platform linux` after the Mac package. It is not signed; each tarball carries `SHA256SUMS` of its files, and the installer checks the tarball against its checksum. A failed Linux package never holds the Mac one back. A promotion of Mac moves the Linux service of that Build with it (the Release workflow's `Publish the Linux service` step); a Build without one leaves Linux where it was.
- **Windows**: `npm run installer:windows`, the unsigned NSIS installer the Windows updater already reads, then the Microsoft Store MSIX of the same commit (`windows-msix.ts`, the machine's Windows SDK). Release machine 01 submits that MSIX in Partner Center once the Build reaches Beta. A failed MSIX never holds the installer back.
- Both then publish to Dev (its staging feed) with `node scripts/ci-release.mjs publish`, which uploads the installer, its checksum and its records to the Build's release, then replaces the channel's feed, and refuses to replace a channel's newer build. A Dev build whose commit is behind a later push that changed a workflow is skipped (GitHub refuses a workflow's token such a tag); that later push gets its own, newer Dev build.

How long it takes: a package cannot be ready three minutes after a push. Building the universal app with its Chromium engine takes several minutes, and Apple's notarization usually takes a few minutes more, sometimes much longer. The Build number is fixed the moment the commit lands.

## Secrets

The signing, notarization and update keys live only on the release machines, never in this repository or its workflows. Promotion runs in the repository's `release` environment, restricted to `main`, and publishes with the workflow's own token, so it needs no secret. Pull requests never run the Release workflow. Windows installers are unsigned today.

## Checks

`node scripts/ci-release-check.mjs` (part of `npm run check:pr`) checks build numbers, channel keys, feed rewriting, Sparkle signature verification, publication order, that a promotion requires its platform's release machine to have passed the channel, that a promotion takes the Build from its release, that a Dev build waits for the Dev tests, that no package is built here (the release machines build them) and that the workflow never runs for pull requests or reads secrets outside the `release` environment. `node scripts/ci-failure-report-check.mjs` checks how test results open, update and close Issues.
