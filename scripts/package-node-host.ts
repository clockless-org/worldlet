// Packages the Node host (platform/node) for Linux: `worldlet-server-<label>-linux-<arch>.tar.gz` for x64 and arm64,
// each holding the program (worldlet.cjs), the interface build it serves (WorldletWeb), Worldlet's Google Desktop OAuth
// registration (GoogleOAuthClient.json, app identity only: scripts/google-oauth-windows.ts), a pinned Node for that
// architecture, the `bin/worldlet` command and SHA256SUMS of every file. Beside them: each tarball's `.sha256`, the
// record `worldlet-server-<label>-linux.json` and `release.json` (the identity), as `ci-release.mjs publish --platform
// linux` reads them. install.sh unpacks one into ~/.worldlet/<label> (platform/install/README.md#linux).
//
//   node scripts/package-node-host.ts [--out dist/ci/linux] [--arch x64,arm64] [--reuse-web]
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
import {labelOf} from './ci-release.mjs';
import {stageGoogleRegistration} from './google-oauth-windows.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
/** The Node every Linux package carries: the version CI tests with, and nodejs.org's SHASUMS256.txt for it. */
export const NODE_VERSION='22.22.1';
export const NODE_SHA256:Record<string,string>={
 x64:'07c8aafa60644fb81adefa1ee7da860eb1920851ffdc9a37020ab0be47fbc10e',
 arm64:'1d1690e9aba47e887a275abc6d8f7317e571a0700deaef493f768377e99155f5',
};
export const serverName=(label:string,arch:string)=>`worldlet-server-${label}-linux-${arch}.tar.gz`;
export const recordName=(label:string)=>`worldlet-server-${label}-linux.json`;
/** The `worldlet` command in the package: the command line with the Node beside it, wherever it was linked from. */
export const WRAPPER=`#!/bin/sh
# The worldlet command: the Node host's command line (platform/node/README.md), run with the Node this package carries.
here="$(dirname "$(readlink -f "$0")")/.."
exec "$here/node/bin/node" "$here/worldlet.cjs" "$@"
`;

const arg=(name:string)=>{const at=process.argv.indexOf('--'+name);return at<0?undefined:process.argv[at+1];};
const out=path.resolve(arg('out')||path.join(root,'dist/ci/linux'));
const arches=(arg('arch')||'x64,arm64').split(',');
if(!arches.length||!arches.every(arch=>NODE_SHA256[arch]))throw Error('Usage: package-node-host.ts [--out <dir>] [--arch x64,arm64] [--reuse-web]');
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
 for(const arch of arches){
  const node=await nodeTarball(arch),stage=path.join(work,arch);
  fs.mkdirSync(path.join(stage,'bin'),{recursive:true});
  fs.copyFileSync(path.join(program,'worldlet.cjs'),path.join(stage,'worldlet.cjs'));
  fs.cpSync(web,path.join(stage,'WorldletWeb'),{recursive:true,filter:source=>path.basename(source)!=='.dev-reload'});
  // Beside worldlet.cjs, where the host looks for it (platform/node main.ts sets resourcesPath to the program's folder).
  if(!stageGoogleRegistration(root,stage)){
   if(process.env.WORLDLET_RELEASE_MANIFEST)throw Error('A release of the Linux service needs Worldlet\'s Google registration: set WORLDLET_GOOGLE_CLIENT_FILE, or place it at .local/google-oauth-client.json.');
   console.log('No Google registration: this package\'s Google sign-in will say it is not configured.');
  }
  const unpacked=path.join(work,'node-'+arch);fs.mkdirSync(unpacked);
  run('tar',['-xzf',node,'-C',unpacked]);
  const top=path.join(unpacked,`node-v${NODE_VERSION}-linux-${arch}`);
  fs.mkdirSync(path.join(stage,'node/bin'),{recursive:true});
  fs.copyFileSync(path.join(top,'bin/node'),path.join(stage,'node/bin/node'));fs.chmodSync(path.join(stage,'node/bin/node'),0o755);
  fs.copyFileSync(path.join(top,'LICENSE'),path.join(stage,'node/LICENSE'));
  fs.writeFileSync(path.join(stage,'bin/worldlet'),WRAPPER,{mode:0o755});fs.chmodSync(path.join(stage,'bin/worldlet'),0o755);
  // Every file's hash, as `sha256sum -c SHA256SUMS` reads it in the unpacked folder.
  const listed=walk(stage).sort();
  fs.writeFileSync(path.join(stage,'SHA256SUMS'),listed.map(file=>`${sha256(path.join(stage,file))}  ${file}\n`).join(''));
  const name=serverName(label,arch),tarball=path.join(out,name);
  run('tar',['-czf',tarball,'-C',stage,'.']);
  const hash=sha256(tarball);
  fs.writeFileSync(tarball+'.sha256',`${hash}  ${name}\n`);
  files[arch]={name,size:fs.statSync(tarball).size,sha256:hash};
  fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(unpacked,{recursive:true,force:true});
  console.log(`Packaged ${path.relative(root,tarball)} (${Math.round(files[arch].size/1048576)} MB)`);
 }
 fs.writeFileSync(path.join(out,recordName(label)),JSON.stringify({formatVersion:1,version:identity.version,build:identity.build,node:NODE_VERSION,files},null,2)+'\n');
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
/** nodejs.org's Linux tarball for `arch`, from the cache or downloaded once, checked against its pinned hash. */
async function nodeTarball(arch:string):Promise<string> {
 const name=`node-v${NODE_VERSION}-linux-${arch}.tar.gz`,cache=path.join(root,'dist/node-cache'),file=path.join(cache,name);
 if(!fs.existsSync(file)||sha256(file)!==NODE_SHA256[arch]){
  fs.mkdirSync(cache,{recursive:true});
  const response=await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${name}`);
  if(!response.ok)throw Error(`Could not download ${name}: HTTP ${response.status}`);
  fs.writeFileSync(file+'.part',Buffer.from(await response.arrayBuffer()));
  fs.renameSync(file+'.part',file);
 }
 if(sha256(file)!==NODE_SHA256[arch])throw Error(`${name} does not match its pinned SHA-256.`);
 return file;
}
