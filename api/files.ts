// The files of this repository the operations repository reads, copies or bundles (api/README.md): paths from the
// repository root. Data the app owns (a theme's images, a World's plates) carries its own paths, also from the root.
export const FILES=Object.freeze({
 // The website build.
 brand:'resources/styles/builtin/assets/brand/',
 brandMark:'resources/styles/builtin/assets/brand/mark.json',
 appleTouchIcon:'resources/styles/builtin/assets/brand/apple-touch-icon.png',
 astronomyLicense:'resources/common/ASTRONOMY-LICENSE.txt',
 fonts:'resources/common/fonts/',
 controlsCss:'resources/styles/builtin/controls.css',
 gamesCss:'ui/applets/_shared/games.css',
 worlds:'resources/worlds/',
 immersiveComposition:'resources/styles/builtin/references/immersive/composition.json',
 install:'platform/install/',
 macReleasePage:'ui/frame/mac-release.ts',
 webOpenScript:'platform/web/page/open.ts',
 webOpenPage:'platform/web/page/open.html',
 webOpenStyle:'platform/web/page/open.css',
 modelSources:'contracts/model-sources.json',
 // The release hosts.
 channels:'platform/desktop/distribution/Channels.json',
 updates:'platform/desktop/distribution/Updates.json',
 analytics:'platform/desktop/distribution/Analytics.json',
 macBuild:'platform/desktop/distribution/mac/ci-build.sh',
 windowsInstaller:'platform/desktop/distribution/windows/installer.nsi',
 updatesModule:'platform/host/modules/shell/updates.ts',
 onboardingPaths:'platform/desktop/src/checks/onboarding-paths.ts',
 // The phone release jobs (Play, TestFlight) build these projects.
 iosProject:'platform/ios/',
 androidProject:'platform/android/',
});
export type PublicFile=keyof typeof FILES;
