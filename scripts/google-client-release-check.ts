// Every release build ships Worldlet's Google Desktop OAuth registration (GoogleOAuthClient.json, app identity only),
// so Google sign-in never says "not configured" on an installed copy: the Mac package requires it when signing, the
// Windows installer, MSIX and Steam packages refuse to build without it, and the Linux service stages it beside
// worldlet.cjs, where the Node host looks for it, and refuses a release without it. A local try may package without it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file:string)=>readFileSync(file,'utf8');
// Where the host looks: `<resourcesPath>/GoogleOAuthClient.json` in a package.
assert.match(read('platform/electron/src/resources.ts'),/case 'googleClient':\s*\n\s*if\(packaged\)candidates\.push\(path\.join\(packaged,'GoogleOAuthClient\.json'\)\)/);
// The Node host's resourcesPath is the program's own folder in an installed copy.
assert.match(read('platform/node/src/main.ts'),/resources=fs\.existsSync\(path\.join\(here,'WorldletWeb'\)\)\?here:path\.dirname\(here\);\s*\n\(process as \{resourcesPath\?:string\}\)\.resourcesPath=resources;/);
// Mac (and any signed package): required.
assert.match(read('scripts/package-electron.ts'),/google-oauth-bundle\.py',googleStage,\.\.\.\(sign\?\['--required'\]:\[\]\)/);
assert.match(read('scripts/package-electron.ts'),/copyFileSync\(path\.join\(googleStage,'Resources\/GoogleOAuthClient\.json'\),path\.join\(dir,'GoogleOAuthClient\.json'\)\)/);
// Windows: the installer, MSIX and Steam packages each refuse a payload without it.
assert.match(read('scripts/windows-installer.ts'),/if\(!existsSync\(path\.join\(payload,'resources\/GoogleOAuthClient\.json'\)\)\)throw Error\('Incomplete Windows package: resources\/GoogleOAuthClient\.json/);
for(const file of ['scripts/windows-msix.ts','scripts/windows-steam.ts'])assert.match(read(file),/'resources\/GoogleOAuthClient\.json'/,file);
// Linux: staged beside worldlet.cjs in each architecture's folder, and a release refuses to package without it.
const linux=read('scripts/package-node-host.ts');
assert.match(linux,/import \{stageGoogleRegistration\} from '\.\/google-oauth-windows\.ts';/);
assert.match(linux,/if\(!stageGoogleRegistration\(root,stage\)\)\{\s*\n\s*if\(process\.env\.WORLDLET_RELEASE_MANIFEST\)throw Error\(/);
assert.ok(linux.indexOf('stageGoogleRegistration(root,stage)')<linux.indexOf("listed=walk(stage)"),'staged before SHA256SUMS lists every file');
console.log('PASS Google registration in every release: required when signing (Mac), by the Windows installer, MSIX and Steam packages, and staged beside worldlet.cjs for the Linux service, which refuses a release without it');
