// Windows entry points for the shared Electron desktop host.
// dev → npm run dev:worktree flow; build → development build; check → Electron suite;
// package → unsigned Windows package; installer → package, then the NSIS installer.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const command=process.argv[2]||'dev';
if(!['dev','build','check','package','installer'].includes(command))throw Error('Use dev, build, check, package or installer.');
function run(script:string,...args:string[]){
 const result=spawnSync(process.execPath,[script,...args],{cwd:root,stdio:'inherit',env:{...process.env,WORLDLET_TARGET_PLATFORM:'windows'}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
if(command==='dev')run('scripts/dev-electron.ts',...process.argv.slice(3));
if(command==='build')run('scripts/build-app.ts');
if(command==='check')run('scripts/electron-checks.ts');
if(command==='package'||command==='installer')run('scripts/package-electron.ts','--platform','win32','--arch','x64');
if(command==='installer'){if(process.platform!=='win32')throw Error('Build Windows installers on Windows.');run('scripts/windows-installer.ts');}
