// What the release hosts use from the build they test (api/README.md). Runs in Node.
export {RC_CHECK_MARKER,RELEASE_CHECKS,rcCheckRoot} from '../platform/host/rc-check.ts';
export {UPDATE_ACCEPTANCE_USAGE,acceptanceReportPath,updateAcceptance} from '../platform/host/modules/app/update-acceptance.ts';
export {WINDOWS_ALPHA_MANIFEST_URL,downloadWindowsInstaller,fetchWindowsRelease,parseWindowsManifest,windowsUpdateTest} from '../platform/host/modules/app/windows-release.ts';
export {SETUP_OPTIONS} from '../platform/desktop/src/checks/setup-option-names.ts';
