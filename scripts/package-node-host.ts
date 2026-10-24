// Packages the Node host (platform/server), the headless service: `worldlet-server-<label>-<target>.tar.gz` for each of
// linux-x64, linux-arm64, macos-x64, macos-arm64 and windows-x64, each holding the program (worldlet.cjs), the
// interface build it serves (WorldletWeb), Worldlet's Google Desktop OAuth registration (GoogleOAuthClient.json, app
// identity only: scripts/google-oauth-windows.ts), a pinned Node for that system, the `bin/worldlet` command
// (`bin/worldlet.cmd` on Windows) and SHA256SUMS of every file. Beside them: each tarball's `.sha256`, the record
// `worldlet-server-<label>.json` and `release.json` (the identity), as `ci-release.mjs publish --platform server` reads
// them. The one-line installers unpack one into ~/.worldlet/<label> (platform/install/README.md).
// Nothing in a package is native to the system that packs it, so one release machine packs them all.
//
//   node scripts/package-node-host.ts [--out dist/ci/server] [--target linux-x64,…] [--reuse-web]
//
// The Google registration comes from WORLDLET_GOOGLE_CLIENT_FILE or .local/google-oauth-client.json. A release (with
// WORLDLET_RELEASE_MANIFEST, as the release machine builds it) refuses to package without one, so Google sign-in never
// says it is not configured on an installed service; a local try packages without it and says so.
//
// --reuse-web packages the dist/WorldletWeb already built instead of building it again (a local try; a release builds
// it fresh). The Node tarballs are downloaded once into dist/node-cache and must match the hashes pinned here.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInfo} from './build-info.ts';
import {SERVER_TARGETS,labelOf,serverName,serverRecordName} from './ci-release.mjs';
import {stageGoogleRegistration} from './google-oauth-windows.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
/** The Node every package carries: the version CI tests with, and nodejs.org's SHASUMS256.txt for each system's archive. */
export const NODE_VERSION='22.22.1';
export const NODE_ARCHIVES:Record<string,{name:string;sha256:string}>={
 'linux-x64':{name:`node-v${NODE_VERSION}-linux-x64.tar.gz`,sha256:'07c8aafa60644fb81adefa1ee7da860eb1920851ffdc9a37020ab0be47fbc10e'},
 'linux-arm64':{name:`node-v${NODE_VERSION}-linux-arm64.tar.gz`,sha256:'1d1690e9aba47e887a275abc6d8f7317e571a0700deaef493f768377e99155f5'},
 'macos-x64':{name:`node-v${NODE_VERSION}-darwin-x64.tar.gz`,sha256:'07b13722d558790fca20bb1ecf61bde24b7a4863111f7be77fc57251a407359a'},
 'macos-arm64':{name:`node-v${NODE_VERSION}-darwin-arm64.tar.gz`,sha256:'679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2'},
 'windows-x64':{name:`node-v${NODE_VERSION}-win-x64.zip`,sha256:'877cb93829e14fffbbc7903e7d8037336c9a79f3ea43c5d0b8c2379b79da56de'},
};
/** The `worldlet` command in the package: the command line with the Node beside it, wherever it was linked from. */
export const WRAPPER=`#!/bin/sh
# The worldlet command: the Node host's command line (platform/server/README.md), run with the Node this package carries.
here="$(dirname "$(readlink -f "$0")")/.."
exec "$here/node/bin/node" "$here/worldlet.cjs" "$@"
`;
/** The same on Windows, `bin\worldlet.cmd`, with node.exe in `node\`. */
export const WINDOWS_WRAPPER=`@echo off\r
rem The worldlet command: the Node host's command line (platform/server/README.md), run with the Node this package carries.\r
"%~dp0..\\node\\node.exe" "%~dp0..\\worldlet.cjs" %*\r
`;

const arg=(name:string)=>{const at=process.argv.indexOf('--'+name);return at<0?undefined:process.argv[at+1];};
const out=path.resolve(arg('out')||path.join(root,'dist/ci/server'));
const targets=(arg('target')||SERVER_TARGETS.join(',')).split(',');
if(!targets.length||!targets.every(target=>NODE_ARCHIVES[target]))throw Error(`Usage: package-node-host.ts [--out <dir>] [--target ${SERVER_TARGETS.join(',')}] [--reuse-web]`);
const sha256=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(command:string,args:string[],options:{cwd?:string}={})=>execFileSync(command,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32',...options,env:{...process.env,COPYFILE_DISABLE:'1'}});

const identity=buildInfo(),label=labelOf(identity.version);
const web=path.join(root,'dist/WorldletWeb');
if(!process.argv.includes('--reuse-web')||!fs.existsSync(path.join(web,'applet-runtime.json')))run('npm',['run','build:native-ui']);
for(const file of ['applet-runtime.json','attention-applets.json','applets'])if(!fs.existsSync(path.join(web,file)))throw Error(`The interface build has no ${file}.`);

fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const work=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-server-'));
try{
 const program=path.join(work,'program');
 run(process.execPath,[path.join(root,'scripts/build-node-host.ts'),'--out',program]);
 const files:Record<string,{name:string;size:number;sha256:string}>={};
 for(const target of targets){
  const windows=target.startsWith('windows-'),node=await nodeArchive(target),stage=path.join(work,target);
  fs.mkdirSync(path.join(stage,'bin'),{recursive:true});
  fs.copyFileSync(path.join(program,'worldlet.cjs'),path.join(stage,'worldlet.cjs'));
  fs.cpSync(web,path.join(stage,'WorldletWeb'),{recursive:true,filter:source=>path.basename(source)!=='.dev-reload'});
  // Beside worldlet.cjs, where the host looks for it (platform/server main.ts sets resourcesPath to the program's folder).
  if(!stageGoogleRegistration(root,stage)){
   if(process.env.WORLDLET_RELEASE_MANIFEST)throw Error('A release of the headless service needs Worldlet\'s Google registration: set WORLDLET_GOOGLE_CLIENT_FILE, or place it at .local/google-oauth-client.json.');
   console.log('No Google registration: this package\'s Google sign-in will say it is not configured.');
  }
  const unpacked=path.join(work,'node-'+target);fs.mkdirSync(unpacked);
  if(windows)run(process.platform==='win32'?'tar':'unzip',process.platform==='win32'?['-xf',node,'-C',unpacked]:['-q',node,'-d',unpacked]);
  else run('tar',['-xzf',node,'-C',unpacked]);
  const top=path.join(unpacked,NODE_ARCHIVES[target].name.replace(/\.(tar\.gz|zip)$/,''));
  if(windows){
   fs.mkdirSync(path.join(stage,'node'),{recursive:true});
   fs.copyFileSync(path.join(top,'node.exe'),path.join(stage,'node/node.exe'));
   fs.writeFileSync(path.join(stage,'bin/worldlet.cmd'),WINDOWS_WRAPPER);
  }else{
   fs.mkdirSync(path.join(stage,'node/bin'),{recursive:true});
   fs.copyFileSync(path.join(top,'bin/node'),path.join(stage,'node/bin/node'));fs.chmodSync(path.join(stage,'node/bin/node'),0o755);
   fs.writeFileSync(path.join(stage,'bin/worldlet'),WRAPPER,{mode:0o755});fs.chmodSync(path.join(stage,'bin/worldlet'),0o755);
  }
  fs.copyFileSync(path.join(top,'LICENSE'),path.join(stage,'node/LICENSE'));
  // Every file's hash, as `sha256sum -c SHA256SUMS` reads it in the unpacked folder.
  const listed=walk(stage).sort();
  fs.writeFileSync(path.join(stage,'SHA256SUMS'),listed.map(file=>`${sha256(path.join(stage,file))}  ${file}\n`).join(''));
  const name=serverName(label,target),tarball=path.join(out,name);
  run('tar',['-czf',tarball,'-C',stage,'.']);
  const hash=sha256(tarball);
  fs.writeFileSync(tarball+'.sha256',`${hash}  ${name}\n`);
  files[target]={name,size:fs.statSync(tarball).size,sha256:hash};
  fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(unpacked,{recursive:true,force:true});
  console.log(`Packaged ${path.relative(root,tarball)} (${Math.round(files[target].size/1048576)} MB)`);
 }
 fs.writeFileSync(path.join(out,serverRecordName(label)),JSON.stringify({formatVersion:1,version:identity.version,build:identity.build,node:NODE_VERSION,files},null,2)+'\n');
 const manifest=process.env.WORLDLET_RELEASE_MANIFEST;
 fs.writeFileSync(path.join(out,'release.json'),manifest?fs.readFileSync(manifest):JSON.stringify({...identity,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()},null,2)+'\n');
}finally{fs.rmSync(work,{recursive:true,force:true});}

/** Every file under `dir`, relative, with `/` separators. */
function walk(dir:string,prefix=''):string[] {
 return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(entry=>{
  const relative=prefix?prefix+'/'+entry.name:entry.name;
  return entry.isDirectory()?walk(dir,relative):[relative];
 });
}
/** nodejs.org's archive for `target`, from the cache or downloaded once, checked against its pinned hash. */
async function nodeArchive(target:string):Promise<string> {
 const {name,sha256:pinned}=NODE_ARCHIVES[target],cache=path.join(root,'dist/node-cache'),file=path.join(cache,name);
 if(!fs.existsSync(file)||sha256(file)!==pinned){
  fs.mkdirSync(cache,{recursive:true});
  const response=await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${name}`);
  if(!response.ok)throw Error(`Could not download ${name}: HTTP ${response.status}`);
  fs.writeFileSync(file+'.part',Buffer.from(await response.arrayBuffer()));
  fs.renameSync(file+'.part',file);
 }
 if(sha256(file)!==pinned)throw Error(`${name} does not match its pinned SHA-256.`);
 return file;
}
