// Builds the CEF website engine (platform/web-engine/README.md) for this host, or for one Mac
// architecture: node scripts/build-web-engine.ts [--arch arm64|x64] [--force]
// Downloads the pinned CEF minimal distribution once, builds with CMake and
// assembles the runnable engine under .local/web-engine/<platform>-<arch>/ (macOS: `Worldlet Web.app`
// plus the host's shared-surface addon; Windows: `Worldlet Web/`; Linux: `worldlet-web/`). Unchanged
// sources skip the build.
// Development builds sign ad hoc; scripts/package-electron.ts signs the packaged copy.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmodSync,copyFileSync,cpSync,createWriteStream,existsSync,mkdirSync,readFileSync,readdirSync,readlinkSync,renameSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {macUsageDescriptions} from './mac-app-info.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'platform/web-engine');
interface Pin {
 version:string;source:string;archives:Record<string,{platform:string;sha1:string}>;
 /** Worldlet's own build with H.264/AAC (#1174, scripts/build-cef.ts), once pinned by SHA-256. */
 codecs?:{source:string;archives:Record<string,{platform:string;sha256?:string}>};
}
const pin=():Pin=>JSON.parse(readFileSync(path.join(source,'cef.json'),'utf8'));
export const HELPER_SUFFIXES=['',' (Renderer)',' (GPU)',' (Plugin)',' (Alerts)'];

export const engineKey=(platform:string=process.platform,arch:string=process.arch)=>`${platform}-${arch==='arm64'?'arm64':'x64'}`;
export const engineDirectory=(key:string,base=root)=>path.join(base,'.local/web-engine',key);
/** The engine's folder on Windows and Linux. Chromium splits the path of its Linux sandbox helper
 * (`chrome-sandbox`, beside the engine) at spaces, so the Linux folder has none. */
export const engineFolder=(platform:string=process.platform)=>platform==='linux'?'worldlet-web':'Worldlet Web';
/** The engine executable inside a built engine directory, or inside a packaged app's resources. */
export function engineExecutable(directory:string,platform:string=process.platform){
 return platform==='darwin'?path.join(directory,'Worldlet Web.app/Contents/MacOS/Worldlet Web'):path.join(directory,engineFolder(platform),platform==='win32'?'Worldlet Web.exe':'worldlet-web');
}

function run(command:string,args:string[],options:{cwd?:string,env?:NodeJS.ProcessEnv}={}){
 const result=spawnSync(command,args,{cwd:options.cwd??root,stdio:'inherit',env:options.env??process.env});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${path.basename(command)} ${args.slice(0,2).join(' ')} failed (${result.status})`);
}
function cacheDirectory(){
 const base=process.platform==='darwin'?path.join(os.homedir(),'Library/Caches'):process.platform==='win32'?(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local')):path.join(os.homedir(),'.cache');
 const directory=path.join(base,'WorldletBuild','Chromium');mkdirSync(directory,{recursive:true});return directory;
}
function sha1(file:string){return createHash('sha1').update(readFileSync(file)).digest('hex');}
function sha256(file:string){return createHash('sha256').update(readFileSync(file)).digest('hex');}
/** Worldlet's own CEF build for `key` once it is pinned. A Mac uses it only with both architectures
 * pinned, so a universal app merges two engines of the same build. `WORLDLET_CEF_STANDARD=1` keeps
 * the standard build. */
export function ownCef(key:string,value:Pin=pin()){
 const archives=value.codecs?.archives??{},pinned=(name:string)=>!!archives[name]?.sha256;
 if(process.env.WORLDLET_CEF_STANDARD==='1'||!pinned(key))return null;
 if(key.startsWith('darwin-')&&!(pinned('darwin-arm64')&&pinned('darwin-x64')))return null;
 return {...archives[key],sha256:archives[key].sha256!,source:value.codecs!.source};
}
async function download(url:string,file:string,matches:(file:string)=>boolean){
 const response=await fetch(url);
 if(!response.ok||!response.body)throw Error(`CEF download failed (${response.status}).`);
 const partial=file+'.download';
 await pipeline(Readable.fromWeb(response.body as any),createWriteStream(partial));
 if(!matches(partial)){rmSync(partial,{force:true});throw Error('CEF archive checksum mismatch.');}
 renameSync(partial,file);
}

/** The pinned CEF minimal distribution for `key`, downloaded and unpacked once per machine. */
/** The pinned CEF minimal distribution for `key`, unpacked in the machine cache: Worldlet's own build
 * with H.264/AAC once pinned (`ownCef`), otherwise the standard build. */
export async function cefDistribution(key:string){
 const {version,source:base,archives}=pin(),archive=archives[key],own=ownCef(key);
 if(!archive&&!own)throw Error(`No pinned CEF distribution for ${key} (platform/web-engine/cef.json).`);
 const platform=own?own.platform:archive.platform,name=`cef_binary_${version}_${platform}_minimal`;
 // Both builds unpack to the same folder name, so Worldlet's own unpacks one level down.
 const cache=own?path.join(cacheDirectory(),'codecs'):cacheDirectory(),directory=path.join(cache,name);
 const file=path.join(cacheDirectory(),name+(own?'_codecs':'')+'.tar.bz2');
 mkdirSync(cache,{recursive:true});
 if(existsSync(path.join(directory,'include/cef_version.h')))return directory;
 if(own){
  if(!existsSync(file)||sha256(file)!==own.sha256){
   console.log(`Downloading Worldlet's CEF ${version} with H.264/AAC (${platform})…`);
   await download(own.source+encodeURIComponent(path.basename(file)),file,partial=>sha256(partial)===own.sha256);
  }
 }else if(!existsSync(file)||sha1(file)!==archive.sha1){
  console.log(`Downloading CEF ${version} (${platform})…`);
  await download(base+encodeURIComponent(path.basename(file)),file,partial=>sha1(partial)===archive.sha1);
 }
 run('tar',['-xjf',file,'-C',cache]);
 if(!existsSync(path.join(directory,'include/cef_version.h')))throw Error('The CEF archive did not unpack as expected.');
 return directory;
}

/** Visual Studio's C++ tools on Windows: its own CMake and Ninja, run in the vcvars64 environment. */
function windowsToolchain(){
 const vswhere=path.join(process.env['ProgramFiles(x86)']??'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
 const found=spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8'});
 const studio=found.status===0?found.stdout.trim().split(/\r?\n/)[0]:'';
 if(!studio)throw Error('Visual Studio with the C++ tools is required to build the website engine on Windows.');
 const vcvars=path.join(studio,'VC','Auxiliary','Build','vcvars64.bat');
 const variables=spawnSync('cmd.exe',['/d','/s','/c',`"call "${vcvars}" >nul && set"`],{encoding:'utf8',windowsVerbatimArguments:true});
 if(variables.status!==0)throw Error('The Visual Studio build environment could not be loaded.');
 const env:NodeJS.ProcessEnv={};
 for(const line of variables.stdout.split(/\r?\n/)){const index=line.indexOf('=');if(index>0)env[line.slice(0,index)]=line.slice(index+1);}
 const tools=path.join(studio,'Common7','IDE','CommonExtensions','Microsoft','CMake');
 return {env,cmake:path.join(tools,'CMake','bin','cmake.exe'),ninja:path.join(tools,'Ninja','ninja.exe')};
}

function cmake(){
 const found=spawnSync('which',['cmake'],{encoding:'utf8'});
 if(found.status===0&&found.stdout.trim())return found.stdout.trim().split(/\r?\n/)[0];
 const cached=path.join(cacheDirectory(),'tools/bin/cmake');
 if(existsSync(cached))return cached;
 // The retired Mac host's builder used a private CMake as well.
 const tools=path.join(cacheDirectory(),'tools');
 run('python3',['-m','venv',tools]);run(path.join(tools,'bin/pip'),['install','cmake==4.4.3']);
 return cached;
}

/** Every input of a build: a change to any of them rebuilds the engine. */
function stamp(key:string){
 const hash=createHash('sha256').update(key).update(readFileSync(fileURLToPath(import.meta.url))).update(JSON.stringify(macUsageDescriptions));
 const walk=(directory:string)=>{for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);else hash.update(path.relative(source,file)).update(readFileSync(file));
 }};
 walk(source);
 return hash.digest('hex');
}

const plistValue=(value:string|boolean)=>typeof value==='boolean'?`<${value}/>`:`<string>${value.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</string>`;
function writePlist(file:string,entries:Record<string,string|boolean>){
 writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n${Object.entries(entries).map(([key,value])=>`<key>${key}</key>${plistValue(value)}`).join('\n')}\n</dict></plist>\n`);
}

function assembleMac(build:string,cef:string,out:string,version:string,codecs:boolean){
 const app=path.join(out,'Worldlet Web.app'),contents=path.join(app,'Contents');
 rmSync(app,{recursive:true,force:true});
 for(const part of ['MacOS','Frameworks','Resources'])mkdirSync(path.join(contents,part),{recursive:true});
 copyFileSync(path.join(build,'WorldletWeb'),path.join(contents,'MacOS/Worldlet Web'));chmodSync(path.join(contents,'MacOS/Worldlet Web'),0o755);
 run('ditto',['--noextattr',path.join(cef,'Release/Chromium Embedded Framework.framework'),path.join(contents,'Frameworks/Chromium Embedded Framework.framework')]);
 const common={CFBundlePackageType:'APPL',CFBundleVersion:'1',CFBundleShortVersionString:version.split('+')[0],LSMinimumSystemVersion:'14.0',NSHighResolutionCapable:true,LSUIElement:true};
 // CEF picks the renderer/GPU/plugin helper by its conventional suffix.
 for(const suffix of HELPER_SUFFIXES){
  const name='Worldlet Web Helper'+suffix,helper=path.join(contents,'Frameworks',name+'.app/Contents');
  mkdirSync(path.join(helper,'MacOS'),{recursive:true});
  copyFileSync(path.join(build,'WorldletWebHelper'),path.join(helper,'MacOS',name));chmodSync(path.join(helper,'MacOS',name),0o755);
  writePlist(path.join(helper,'Info.plist'),{...common,CFBundleName:name,CFBundleExecutable:name,CFBundleIdentifier:'app.worldlet.web.helper'+suffix.replace(/[ ()]/g,'').replace(/^(.)/,'.$1').toLowerCase()});
 }
 // Chromium asks for Bluetooth, camera, microphone and location on the person's behalf; the
 // engine declares the same descriptions as the app (#1135).
 writePlist(path.join(contents,'Info.plist'),{...common,CFBundleName:'Worldlet Web',CFBundleDisplayName:'Worldlet Web',CFBundleExecutable:'Worldlet Web',CFBundleIdentifier:'app.worldlet.web',NSSupportsAutomaticGraphicsSwitching:true,...macUsageDescriptions});
 copyFileSync(path.join(cef,'LICENSE.txt'),path.join(contents,'Resources/Chromium-CEF-LICENSE.txt'));
 // Identical for every architecture, so a universal app merges the two engines file by file.
 writeFileSync(path.join(contents,'Resources/web-engine.json'),JSON.stringify({cef:version,codecs})+'\n');
}

function signMac(app:string){
 const sign=(file:string)=>run('codesign',['--force','--sign','-',file]);
 const framework=path.join(app,'Contents/Frameworks/Chromium Embedded Framework.framework');
 for(const library of readdirSync(path.join(framework,'Libraries')).filter(name=>name.endsWith('.dylib')))sign(path.join(framework,'Libraries',library));
 sign(framework);
 for(const suffix of HELPER_SUFFIXES)sign(path.join(app,'Contents/Frameworks',`Worldlet Web Helper${suffix}.app`));
 sign(app);
}

/** The Electron main process's Mach receiver for shared surfaces (platform/web-engine/addon). */
function buildAddon(out:string,arch:string){
 const include=path.join(path.dirname(process.execPath),'..','include','node');
 if(!existsSync(path.join(include,'node_api.h')))throw Error('Node-API headers are missing; install Node.js with its headers ('+include+').');
 const addon=path.join(out,'worldlet_surfaces.node');
 run('clang++',['-std=c++20','-fobjc-arc','-O2','-arch',arch,'-mmacosx-version-min=14.0','-bundle','-undefined','dynamic_lookup','-DNODE_GYP_MODULE_NAME=worldlet_surfaces','-I'+include,
  path.join(source,'addon/surfaces_mac.mm'),'-framework','Foundation','-framework','IOSurface','-lbsm','-o',addon]);
 run('codesign',['--force','--sign','-',addon]);
}

/** Linux: `worldlet-web` beside libcef.so, the rest of CEF's Release folder (Chromium's sandbox helper
 * among it) and its resources. */
function assembleLinux(build:string,cef:string,out:string,version:string,codecs:boolean){
 const target=path.join(out,engineFolder('linux'));
 rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
 copyFileSync(path.join(build,'worldlet-web'),path.join(target,'worldlet-web'));chmodSync(path.join(target,'worldlet-web'),0o755);
 cpSync(path.join(cef,'Release'),target,{recursive:true});
 // The distribution's libcef.so carries its debug information, most of its size.
 run('strip',['--strip-debug',path.join(target,'libcef.so')]);
 cpSync(path.join(cef,'Resources'),target,{recursive:true});
 copyFileSync(path.join(cef,'LICENSE.txt'),path.join(target,'Chromium-CEF-LICENSE.txt'));
 writeFileSync(path.join(target,'web-engine.json'),JSON.stringify({cef:version,codecs})+'\n');
}

function assembleWindows(build:string,cef:string,out:string,version:string,codecs:boolean){
 const target=path.join(out,'Worldlet Web');
 rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
 copyFileSync(existsSync(path.join(build,'WorldletWeb.exe'))?path.join(build,'WorldletWeb.exe'):path.join(build,'Release','WorldletWeb.exe'),path.join(target,'Worldlet Web.exe'));
 for(const name of readdirSync(path.join(cef,'Release')))if(/\.(dll|bin|json)$/i.test(name))copyFileSync(path.join(cef,'Release',name),path.join(target,name));
 cpSync(path.join(cef,'Resources'),target,{recursive:true});
 copyFileSync(path.join(cef,'LICENSE.txt'),path.join(target,'Chromium-CEF-LICENSE.txt'));
 writeFileSync(path.join(target,'web-engine.json'),JSON.stringify({cef:version,codecs})+'\n');
}

/** Points the checkout's engine directory at a built engine in the machine cache. */
function link(out:string,target:string){
 try{if(path.resolve(readlinkSync(out))===path.resolve(target))return;}catch{}
 rmSync(out,{recursive:true,force:true});mkdirSync(path.dirname(out),{recursive:true});
 symlinkSync(target,out,process.platform==='win32'?'junction':'dir');
}

/** Keeps the newest few built engines per platform in the machine cache; a checkout linked to a
 * removed one rebuilds or relinks on its next build. */
function prune(directory:string,key:string,keep:string,count=4){
 const pattern=new RegExp('^'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-[0-9a-f]{16}$');
 const entries=readdirSync(directory).filter(name=>pattern.test(name)).map(name=>path.join(directory,name));
 const newest=entries.sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);
 for(const entry of newest.slice(count))if(entry!==keep)rmSync(entry,{recursive:true,force:true});
}

/** Builds (or reuses) the engine for `arch` and returns the checkout's engine directory. Built engines
 * live in the machine cache by source stamp, so worktrees, Dev candidates and release-candidate
 * runs with the same sources share one build. */
export async function buildWebEngine({arch=process.arch,force=false,sign=true}:{arch?:string,force?:boolean,sign?:boolean}={}){
 const key=engineKey(process.platform,arch),out=engineDirectory(key);
 // Packaged apps sign the engine with the app (scripts/package-electron.ts); an ad-hoc bundle
 // signature would also differ per architecture and stop the universal merge.
 const codecs=!!ownCef(key),current=stamp(key+(sign?'':':unsigned')+(codecs?':codecs':''));
 const shared=path.join(path.dirname(cacheDirectory()),'WebEngine',`${key}${sign?'':'-unsigned'}-${current.slice(0,16)}`);
 if(!force&&existsSync(path.join(shared,'.stamp'))&&existsSync(engineExecutable(shared))){if(sign)link(out,shared);return sign?out:shared;}
 if(!['darwin','win32','linux'].includes(process.platform))throw Error('The website engine is not built for '+process.platform+'.');
 const {version}=pin(),cef=await cefDistribution(key),build=path.join(root,'.local/web-engine/build',key);
 // Assembled beside the cache entry and moved in whole, so a concurrent build never sees half of one.
 const partial=shared+'.partial-'+process.pid;
 rmSync(partial,{recursive:true,force:true});mkdirSync(build,{recursive:true});mkdirSync(partial,{recursive:true});
 const configure=['-S',source,'-B',build,'-DCEF_ROOT='+cef,'-DCMAKE_BUILD_TYPE=Release'];
 let tool:string,env:NodeJS.ProcessEnv=process.env;
 if(process.platform==='win32'){
  const windows=windowsToolchain();
  tool=windows.cmake;env=windows.env;
  configure.push('-G','Ninja','-DCMAKE_MAKE_PROGRAM='+windows.ninja);
 }else{
  tool=cmake();
  configure.push(...process.platform==='darwin'?['-DCMAKE_OSX_ARCHITECTURES='+(arch==='arm64'?'arm64':'x86_64')]:[],'-DPROJECT_ARCH='+(arch==='arm64'?'arm64':'x86_64'));
 }
 // A build directory configured for another generator cannot be reused.
 const cache=path.join(build,'CMakeCache.txt'),generator=process.platform==='win32'?'Ninja':'Unix Makefiles';
 if(existsSync(cache)&&!readFileSync(cache,'utf8').includes('CMAKE_GENERATOR:INTERNAL='+generator)){rmSync(build,{recursive:true,force:true});mkdirSync(build,{recursive:true});}
 run(tool,configure,{env});
 run(tool,['--build',build,'--config','Release','--parallel',String(Math.max(2,os.cpus().length))],{env});
 if(process.platform==='darwin'){
  assembleMac(build,cef,partial,version,codecs);
  if(sign)signMac(path.join(partial,'Worldlet Web.app'));
  buildAddon(partial,arch==='arm64'?'arm64':'x86_64');
 }else if(process.platform==='linux')assembleLinux(build,cef,partial,version,codecs);
 else assembleWindows(build,cef,partial,version,codecs);
 writeFileSync(path.join(partial,'.stamp'),current);
 if(existsSync(path.join(shared,'.stamp')))rmSync(partial,{recursive:true,force:true});
 else{rmSync(shared,{recursive:true,force:true});renameSync(partial,shared);}
 if(sign)link(out,shared);
 prune(path.dirname(shared),key+(sign?'':'-unsigned'),shared);
 console.log('Built website engine → '+(sign?path.relative(root,out)+' ':'')+'('+path.basename(shared)+')');
 // Linux: as CEF says, where user namespaces are not available the sandbox helper needs root's setuid bit.
 const helper=path.join(shared,engineFolder(),'chrome-sandbox'),mode=process.platform==='linux'?statSync(helper):null;
 if(mode&&!(mode.uid===0&&mode.mode&0o4000))console.log(`Without user namespaces Chromium's sandbox needs its setuid helper: sudo chown root:root '${helper}' && sudo chmod 4755 '${helper}'`);
 return sign?out:shared;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const option=(name:string)=>{const index=process.argv.indexOf('--'+name);return index>0?process.argv[index+1]:undefined;};
 await buildWebEngine({arch:option('arch'),force:process.argv.includes('--force')});
}
