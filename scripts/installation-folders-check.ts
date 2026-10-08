// One Worldlet folder per installation (2026-10-04): a release keeps Fox's Hermes runtime, local speech and the
// model credential inside its library (`installationRoot`) instead of in `Worldlet Runtime`, `Worldlet Speech` and
// `Worldlet Model Access` beside it. Checked here on the release layout, with Electron stubbed: where each folder
// is, that an RC check's disposable library still uses the installation's runtime, that the old token moves in
// once, and that Reset, backups and restores leave all three alone (#1568 passed only on a development library).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {withTempDir} from './test-temp.ts';

const source=(file:string)=>JSON.stringify(path.resolve('platform/electron/src',file));
await withTempDir('worldlet-installation-folders-',async temp=>{
 const home=path.join(temp,'home with spaces');fs.mkdirSync(home);
 fs.writeFileSync(path.join(temp,'main.ts'),`import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installationRoot,libraryBase,legacyFolder} from ${source('profile.ts')};
import {HermesInstallation} from ${source('modules/agent-runtime/installation.ts')};
import {adoptLegacyToken,loadInstallationToken,modelAccessDirectory} from ${source('modules/agent-runtime/model-access.ts')};
import {HOST_RETAINED,removeExceptRetained} from ${source('modules/fox/reset-files.ts')};
import {KEPT_ON_RESTORE,allowed} from ${source('modules/shell/backup.ts')};
import {INSTALLATION_FOLDERS,adoptFolder} from ${source('files.ts')};
const windows=process.platform==='win32';
const release={channel:'release',worktree:''} as const,base=libraryBase(),library=path.join(base,'Worldlet');
const write=(file:string,data='x')=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};

// Where the folders are: one library per installed channel and Dev worktree.
assert.ok(base.startsWith(${JSON.stringify(home)}),'the check runs on its own temporary home');
assert.equal(installationRoot(release),library);
assert.equal(installationRoot({channel:'dev',worktree:''}),path.join(base,'Worldlet Development'));
assert.equal(installationRoot({channel:'dev',worktree:'0123456789ab'}),path.join(base,'Worldlet Worktrees','0123456789ab'));
assert.deepEqual(INSTALLATION_FOLDERS,['runtime','speech','model-access']);

// The Hermes runtime: in the library; on Mac and Linux the installation's, even for an RC check's disposable library.
const bootstrap=path.join(os.tmpdir(),'worldlet-bootstrap-'+process.pid);
write(path.join(bootstrap,'runtime.json'),JSON.stringify({revision:'0123456789abcdef0123456789abcdef01234567'}));
const disposable=path.join(os.tmpdir(),'worldlet-rc-check');
const installation=new HermesInstallation({profile:{...release,resources:'',webRoot:''},root:disposable} as any);
Object.defineProperty(installation,'bootstrap',{value:bootstrap});
const runtime=installation.root;
if(windows)assert.match(runtime,/runtime[\\\\/]hermes-[0-9a-f]{16}$/);
else assert.equal(path.dirname(runtime),path.join(library,'runtime'));
assert.ok(!runtime.includes('Worldlet Runtime'),'nothing beside the library');

// The model credential: the old token moves in once and keeps its installation; a token already there wins.
const token='a'.repeat(64),other='b'.repeat(64);
const context={profile:release},legacyToken=path.join(legacyFolder('Worldlet Model Access'),'app.worldlet.mac.model-access','installation.token');
write(legacyToken,token);
adoptLegacyToken(context);
assert.equal(modelAccessDirectory(context),path.join(library,'model-access'));
assert.equal(fs.readFileSync(path.join(library,'model-access','installation.token'),'utf8'),token);
assert.ok(!fs.existsSync(legacyFolder('Worldlet Model Access')),'the old folder is gone');
if(!windows){
 fs.chmodSync(path.join(library,'model-access','installation.token'),0o600);
 assert.equal(loadInstallationToken(modelAccessDirectory(context)),token,'the same installation, so the same daily allowance');
}
write(legacyToken,other);
adoptLegacyToken(context);
assert.equal(fs.readFileSync(path.join(library,'model-access','installation.token'),'utf8'),token,'never replaced');
assert.ok(!fs.existsSync(legacyToken));

// Moving an old folder in: once, never over what is already there.
write(path.join(legacyFolder('Worldlet Speech'),'py312','model','config.json'),'old');
assert.equal(adoptFolder(legacyFolder('Worldlet Speech'),path.join(library,'speech')),true);
assert.equal(fs.readFileSync(path.join(library,'speech','py312','model','config.json'),'utf8'),'old');
write(path.join(legacyFolder('Worldlet Speech'),'py312','model','config.json'),'newer');
assert.equal(adoptFolder(legacyFolder('Worldlet Speech'),path.join(library,'speech')),false);
assert.equal(adoptFolder(path.join(base,'missing'),path.join(library,'missing')),false);

// Reset on the release library: World data leaves, the installation's folders stay.
for(const file of ['world.sqlite','sources/notes/a.json',path.relative(library,path.join(runtime,'source','.venv','bin','python3')),'runtime/cache/wheel','runtime/python/cpython/bin/python3','preferences.json','Browser/Electron/Local State'])write(path.join(library,file));
removeExceptRetained(library,new Set(HOST_RETAINED));
assert.deepEqual(fs.readdirSync(library).sort(),['Browser','model-access','preferences.json','runtime','speech']);
assert.equal(fs.readFileSync(path.join(library,'model-access','installation.token'),'utf8'),token);

// Backups never carry them, and a restore never swaps them out (a running install holds their files).
const host={optional:()=>null} as any;
for(const file of ['runtime/cache/wheel','speech/py312/model/config.json','model-access/installation.token'])assert.equal(allowed(host,file),false,file);
assert.equal(allowed(host,'world.sqlite'),true);
for(const folder of INSTALLATION_FOLDERS)assert.ok(KEPT_ON_RESTORE.has(folder),'restore keeps '+folder);
fs.rmSync(bootstrap,{recursive:true,force:true});
console.log('PASS installation folders: runtime, speech and model access live in the release library, the old token moves in once, Reset, backups and restores leave them alone');
`);
 await build({entryPoints:[path.join(temp,'main.ts')],outfile:path.join(temp,'check.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',
  banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"},
  plugins:[{name:'electron-stub',setup(stub){stub.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));stub.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:'export const app={isPackaged:true},safeStorage={isEncryptionAvailable:()=>false},session={},systemPreferences={};',loader:'js'}));}}]});
 execFileSync(process.execPath,[path.join(temp,'check.mjs')],{stdio:'inherit',env:{...process.env,HOME:home,USERPROFILE:home,XDG_DATA_HOME:path.join(home,'.local','share'),LOCALAPPDATA:path.join(home,'AppData','Local')}});
});
