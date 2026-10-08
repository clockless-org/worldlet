// Builds dist/WorldletWeb where it is missing, for the gates that read the interface test:ui builds (test:hermes, as
// scripts/electron-checks.ts does for test:electron). An RC that rechecks such a gate first runs it in a fresh gate
// checkout before test:ui (scripts/machine-nightly.mjs), where no build exists yet (Mac RC 1d45b347).
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(path.join(root,'dist/WorldletWeb/index.html'))){
 const build=spawnSync(process.execPath,['scripts/build-native-ui.ts'],{cwd:root,stdio:'inherit'});
 if(build.status!==0)process.exit(build.status??1);
}
