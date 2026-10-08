// Builds Worldlet's own CEF minimal distribution with proprietary codecs (H.264/AAC, #1174) from the
// CEF source pinned in platform/web-engine/cef.json (`codecs`), for this host or one Mac architecture:
// node scripts/build-cef.ts [--arch arm64|x64] [--jobs N] [--host <checkout>] [--dry-run] [--pin] [--fresh]
// CEF's own automate-git.py, taken from the pinned CEF commit, checks out that commit and the
// Chromium tag it names with depot_tools, builds Release with the pinned GN arguments and packs the
// minimal distribution. Everything lives in the machine cache (WorldletBuild/CEFSource, about 100 GB).
// The archive is left beside the downloaded distributions as
// `cef_binary_<version>_<platform>_minimal_codecs.tar.bz2`; its SHA-256 is printed, and with --pin it
// is written into cef.json, where scripts/build-web-engine.ts then prefers it to the standard build.
// Each architecture takes several hours; it runs with half the cores at background priority so the host keeps working.
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {chmodSync,copyFileSync,createReadStream,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const pinFile=path.join(root,'platform/web-engine/cef.json');
interface Codecs {
 source:string;
 cef:{repository:string;branch:string;commit:string;chromium:string};
 gn:string;
 archives:Record<string,{platform:string;sha256?:string}>;
}
const args=process.argv.slice(2),flag=(name:string)=>args.includes(name);
const option=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};

const cacheBase=()=>process.platform==='darwin'?path.join(os.homedir(),'Library/Caches'):process.platform==='win32'?(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local')):path.join(os.homedir(),'.cache');
/** Where scripts/build-web-engine.ts looks for distributions. */
const distributions=()=>path.join(cacheBase(),'WorldletBuild','Chromium');
const sha256=(file:string)=>new Promise<string>((resolve,reject)=>{const hash=createHash('sha256');createReadStream(file).on('data',chunk=>hash.update(chunk)).on('end',()=>resolve(hash.digest('hex'))).on('error',reject);});

/** cef.json's own layout: one line for each object of plain values. */
export function pinText(value:unknown,indent=''):string {
 if(!value||typeof value!=='object'||Array.isArray(value))return JSON.stringify(value);
 const entries=Object.entries(value as Record<string,unknown>);
 if(entries.every(([,item])=>item===null||typeof item!=='object'))return '{'+entries.map(([name,item])=>JSON.stringify(name)+': '+JSON.stringify(item)).join(', ')+'}';
 const inner=indent+' ';
 return '{\n'+entries.map(([name,item])=>inner+JSON.stringify(name)+': '+pinText(item,inner)).join(',\n')+'\n'+indent+'}';
}

function run(command:string,list:string[],options:{cwd?:string;env?:NodeJS.ProcessEnv}={}){
 console.log('$ '+[command,...list].join(' '));
 const result=spawnSync(command,list,{cwd:options.cwd,stdio:'inherit',env:options.env??process.env});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${path.basename(command)} failed (${result.status})`);
}

// A release host's RC or release (`.local/machine-candidate-state.json`, `.local/machine-release-state.json` in this
// checkout, or in the primary checkout given by --host when the script runs from a copy) gets the machine to itself:
// the build is stopped (SIGSTOP on its process group) while one runs and continued afterwards. Windows has no stop signal, so there the job limit alone keeps the host usable.
const alive=(pid:unknown)=>{if(!Number.isSafeInteger(pid)||(pid as number)<=0)return false;try{process.kill(pid as number,0);return true;}catch{return false;}};
function hostBusy(files:string[]){
 return files.some(file=>{
  try{const state=JSON.parse(readFileSync(file,'utf8'));return ['launching','running'].includes(state?.status)&&[state.pid,state.launcher].some(alive);}
  catch{return false;}
 });
}
function runPausable(command:string,list:string[],options:{cwd:string;env:NodeJS.ProcessEnv}){
 if(process.platform==='win32')return run(command,list,options);
 console.log('$ '+[command,...list].join(' '));
 const child=spawn(command,list,{cwd:options.cwd,env:options.env,stdio:'inherit',detached:true});
 let stopped=false;
 const watch=setInterval(()=>{
  const busy=hostBusy(hostJobs);if(busy===stopped||!child.pid)return;
  try{process.kill(-child.pid,busy?'SIGSTOP':'SIGCONT');stopped=busy;console.log(`${new Date().toISOString()} ${busy?'Paused for':'Resumed after'} this host's RC or release.`);}catch{}
 },30_000);
 const resume=()=>{if(stopped&&child.pid)try{process.kill(-child.pid,'SIGCONT');}catch{}};
 const forward=(signal:NodeJS.Signals)=>{resume();if(child.pid)try{process.kill(-child.pid,signal);}catch{}};
 process.on('SIGINT',forward);process.on('SIGTERM',forward);
 return new Promise<void>((resolve,reject)=>{
  child.on('error',error=>{clearInterval(watch);reject(error);});
  child.on('exit',(code,signal)=>{clearInterval(watch);code===0?resolve():reject(Error(`${path.basename(command)} failed (${code??signal})`));});
 });
}

const hostJobs=['machine-candidate-state.json','machine-release-state.json'].map(name=>path.join(option('--host')??root,'.local',name));
const pin=JSON.parse(readFileSync(pinFile,'utf8')),codecs:Codecs|undefined=pin.codecs;
if(!codecs)throw Error('No codecs build is pinned (platform/web-engine/cef.json `codecs`).');
const arch=option('--arch')??process.arch;
if(!['arm64','x64'].includes(arch))throw Error('Choose --arch arm64 or x64.');
if(process.platform!=='darwin'&&arch!=='x64')throw Error('Only Mac builds both architectures.');
const key=`${process.platform}-${arch}`,archive=codecs.archives[key];
if(!archive)throw Error(`No codecs archive is planned for ${key}.`);

const work=path.join(cacheBase(),'WorldletBuild','CEFSource');mkdirSync(work,{recursive:true});
const depotTools=path.join(work,'depot_tools');
if(!existsSync(path.join(depotTools,'gclient.py')))run('git',['clone','https://chromium.googlesource.com/chromium/tools/depot_tools.git',depotTools]);
// The automation script of the pinned CEF commit itself, so its steps match that branch.
const automate=path.join(work,`automate-git-${codecs.cef.commit.slice(0,12)}.py`);
if(!existsSync(automate)){
 const url=`https://raw.githubusercontent.com/${codecs.cef.repository}/${codecs.cef.commit}/tools/automate/automate-git.py`;
 const response=await fetch(url);
 if(!response.ok)throw Error(`automate-git.py download failed (${response.status}).`);
 writeFileSync(automate+'.download',Buffer.from(await response.arrayBuffer()));renameSync(automate+'.download',automate);
}

// Chromium takes some dependencies through Git LFS (third_party/litert). Without git-lfs on this
// machine, the pinned release goes into the build's own tools, on PATH for the build only.
const GIT_LFS={version:'3.8.0',sha256:{'darwin-arm64':'caff76a7d070d8160c89bc39b6e85d98f24135b6fed038a3b4de2590d25102d8',
 'darwin-x64':'f1c17aeca0b4eaab9ea606226477dbed3b84b56fe0811a9f967d2ea2b2393c53','win32-x64':'b62e7b8ceddee635f691233d77de8eaa4b213e9209e0173811d8cfa77f7882c1'} as Record<string,string>};
async function gitLfs():Promise<string|null> {
 if(spawnSync('git-lfs',['version'],{stdio:'ignore'}).status===0)return null;
 const host=`${process.platform}-${process.arch==='arm64'?'arm64':'x64'}`,digest=GIT_LFS.sha256[host];
 if(!digest)throw Error('Install git-lfs; no pinned release for '+host+'.');
 const directory=path.join(work,'tools',`git-lfs-${GIT_LFS.version}`),binary=path.join(directory,process.platform==='win32'?'git-lfs.exe':'git-lfs');
 if(existsSync(binary))return directory;
 const name=`git-lfs-${host.replace('x64','amd64').replace('win32','windows')}-v${GIT_LFS.version}.zip`,zip=path.join(work,'tools',name);
 mkdirSync(path.dirname(zip),{recursive:true});
 const response=await fetch(`https://github.com/git-lfs/git-lfs/releases/download/v${GIT_LFS.version}/${name}`);
 if(!response.ok)throw Error(`git-lfs download failed (${response.status}).`);
 writeFileSync(zip,Buffer.from(await response.arrayBuffer()));
 if(await sha256(zip)!==digest)throw Error('git-lfs checksum mismatch.');
 const unpacked=path.join(work,'tools','git-lfs-unpack');mkdirSync(unpacked,{recursive:true});
 run(process.platform==='win32'?path.join(process.env.SystemRoot??'C:\\Windows','System32','tar.exe'):'ditto',process.platform==='win32'?['-xf',zip,'-C',unpacked]:['-x','-k',zip,unpacked]);
 mkdirSync(directory,{recursive:true});
 copyFileSync(path.join(unpacked,`git-lfs-${GIT_LFS.version}`,path.basename(binary)),binary);
 if(process.platform!=='win32')chmodSync(binary,0o755);
 return directory;
}
const lfs=await gitLfs();
// The build shares its host with RCs and releases. autoninja's default of every core plus two starved
// WindowServer on 02 until its watchdog panicked the kernel (2026-10-06), so automate-git.py's `autoninja`
// is a shim that passes a fixed -j (Ninja and Siso alike) and runs the build at background priority.
// Half the cores and at most one job per 4 GB of memory (4 on 02's 16 GB); --jobs or WORLDLET_CEF_JOBS overrides.
const jobs=Number(option('--jobs'))||Number(process.env.WORLDLET_CEF_JOBS)||Math.max(2,Math.min(Math.floor(os.cpus().length/2),Math.floor(os.totalmem()/2**32)));
function autoninjaShim(){
 const directory=path.join(work,'tools','autoninja-shim');mkdirSync(directory,{recursive:true});
 if(process.platform==='win32')writeFileSync(path.join(directory,'autoninja.bat'),`@call "${path.join(depotTools,'autoninja.bat')}" -j ${jobs} %*\r\n`);
 else{const shim=path.join(directory,'autoninja');writeFileSync(shim,`#!/bin/sh\nexec "${path.join(depotTools,'autoninja')}" -j ${jobs} "$@"\n`);chmodSync(shim,0o755);}
 return directory;
}
console.log(`Building with ${jobs} jobs at background priority.`);
const env:NodeJS.ProcessEnv={...process.env,GN_DEFINES:codecs.gn,CEF_ARCHIVE_FORMAT:'tar.bz2',DEPOT_TOOLS_WIN_TOOLCHAIN:'0',NINJA_BUILD_IN_BACKGROUND:'1',
 PATH:[autoninjaShim(),depotTools,...lfs?[lfs]:[],process.env.PATH??''].join(path.delimiter)};
// Chromium needs a full Xcode; the system's selection is left alone.
if(process.platform==='darwin'&&!env.DEVELOPER_DIR&&existsSync('/Applications/Xcode.app/Contents/Developer'))env.DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer';
// ANGLE's Metal shaders need Xcode's Metal Toolchain, a separate download since Xcode 26 (the replacement Mac release
// host failed an hour into its first build without it, 2026-10-05).
if(process.platform==='darwin'&&spawnSync('xcrun',['-f','metal'],{env,stdio:'ignore'}).status!==0)throw Error('Xcode has no Metal Toolchain: run `xcodebuild -downloadComponent MetalToolchain` first.');
const python=process.platform==='win32'?'python':'python3';
// --force-build: automate-git.py otherwise skips the build when the source is unchanged and an output folder exists, so
// a build that failed part-way (missing toolchain) was never resumed and no distribution was made.
// automate-git.py syncs a history-less Chromium checkout only when it creates it, so a checkout whose
// first sync was interrupted stays incomplete: --fresh starts it over.
if(flag('--fresh'))rmSync(path.join(work,'chromium'),{recursive:true,force:true});
const log=path.join(work,`build-${codecs.cef.branch}-release.log`);
await runPausable(python,[automate,'--download-dir',work,'--depot-tools-dir',depotTools,'--url',`https://github.com/${codecs.cef.repository}.git`,
 '--branch',codecs.cef.branch,'--checkout',codecs.cef.commit,'--no-chromium-history',
 '--no-debug-build','--force-build','--minimal-distrib-only','--no-distrib-symbols','--no-distrib-docs',`--${arch}-build`,'--build-log-file',
 ...flag('--dry-run')?['--dry-run']:[]],{cwd:work,env});
console.log('Build log: '+log);
if(flag('--dry-run'))process.exit(0);

// automate-git.py packs into chromium/src/cef/binary_distrib.
const packed=path.join(work,'chromium/src/cef/binary_distrib');
const name=readdirSync(packed).filter(file=>file.endsWith(`_${archive.platform}_minimal.tar.bz2`)).sort().at(-1);
if(!name)throw Error('No minimal distribution was packed for '+archive.platform+'.');
const version=name.replace(/^cef_binary_/,'').replace(`_${archive.platform}_minimal.tar.bz2`,'');
if(version!==pin.version)throw Error(`The build is CEF ${version}; the engine pins ${pin.version}.`);
const target=path.join(distributions(),`cef_binary_${version}_${archive.platform}_minimal_codecs.tar.bz2`);
mkdirSync(distributions(),{recursive:true});copyFileSync(path.join(packed,name),target);
const digest=await sha256(target);
console.log(`Built ${path.basename(target)}\nsha256 ${digest}`);
if(flag('--pin')){
 pin.codecs.archives[key]={...archive,sha256:digest};
 writeFileSync(pinFile,pinText(pin)+'\n');
 console.log('Pinned in platform/web-engine/cef.json; upload the archive to '+codecs.source+' before shipping.');
}
