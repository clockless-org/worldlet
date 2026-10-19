// What the release hosts use from the build they test (api/README.md). Runs in Node.
export {RC_CHECK_MARKER,RELEASE_CHECKS,rcCheckRoot} from '../platform/electron/src/rc-check.ts';
export {UPDATE_ACCEPTANCE_USAGE,acceptanceReportPath,updateAcceptance} from '../platform/electron/src/modules/shell/update-acceptance.ts';
export {WINDOWS_ALPHA_MANIFEST_URL,downloadWindowsInstaller,parseWindowsManifest,windowsUpdateTest} from '../platform/electron/src/modules/shell/windows-release.ts';
