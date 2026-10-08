// Packages the Electron desktop app: Mac (arm64, x64 or universal), Windows x64 or Linux x64.
// node scripts/package-electron.ts [--platform darwin|win32|linux] [--arch arm64|x64|universal] [--sign]
// Signing uses WORLDLET_SIGN_IDENTITY (Mac) and notarization WORLDLET_NOTARY_PROFILE (a notarytool
// keychain profile). Routine work never signs, notarizes or publishes.
import {packager} from '@electron/packager';
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync,copyFileSync,chmodSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInfo} from './build-info.ts';
import {packageAgentBrowser} from './package-agent-browser.ts';
import {packageImsg} from './package-imsg.ts';
import {buildWebEngine,engineFolder} from './build-web-engine.ts';
import {git} from './dev-workspace.ts';
import {macIcon} from './app-icon.ts';
import {macUsageDescriptions} from './mac-app-info.ts';
import {installCodesignRetry,sealedNotSigned} from './codesign-retry.mjs';
import {flipAppFuses} from './electron-fuses.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const option=(name:string,fallback:string)=>{const index=process.argv.indexOf('--'+name);return index>0?process.argv[index+1]:fallback;};
const platform=option('platform',process.platform) as 'darwin'|'win32'|'linux';
const arch=option('arch',platform==='darwin'?'universal':'x64') as 'arm64'|'x64'|'universal';
const sign=process.argv.includes('--sign'),notarize=sign&&!process.argv.includes('--no-notarize');
if(!['darwin','win32','linux'].includes(platform))throw Error('Unsupported platform '+platform);
if(platform!=='darwin'&&arch!=='x64')throw Error('Windows and Linux packages are x64.');
if(platform==='darwin'&&process.platform!=='darwin')throw Error('Mac packages are built on macOS.');
function run(command:string,args:string[],env:NodeJS.ProcessEnv=process.env){
 const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`${command} ${args[0]??''} failed (${result.status})`);
}
// On Windows `python3` is usually the Microsoft Store alias; use the interpreter the release host verifies.
const python=process.platform==='win32'?process.env.WORLDLET_SETUP_PYTHON||'python':'python3';
const info=buildInfo(platform==='win32'?'windows':'mac');
const channel=process.env.WORLDLET_DISTRIBUTION_CHANNEL||'unknown';
// 1. Interface and host, release channel.
run(process.execPath,['scripts/build-native-ui.ts'],{...process.env,WORLDLET_BUILD_CHANNEL:'release',WORLDLET_TARGET_PLATFORM:platform==='win32'?'windows':'mac'});
run(process.execPath,['scripts/build-electron.ts']);
// 2. Stage the app directory (asar) and the per-architecture resources beside it.
const staging=mkdtempSync(path.join(os.tmpdir(),'worldlet-electron-'));
const app=path.join(staging,'app');mkdirSync(app);
for(const name of ['main.cjs','world-preload.cjs','web-surface-preload.cjs'])copyFileSync(path.join(root,'dist/electron',name),path.join(app,name));
writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'worldlet',productName:'Worldlet',version:info.version,main:'main.cjs',private:true}));
function resources(target:'arm64'|'x64'){
 const dir=path.join(staging,'resources-'+target);mkdirSync(dir);
 cpSync(path.join(root,'dist/WorldletWeb'),path.join(dir,'WorldletWeb'),{recursive:true});
 rmSync(path.join(dir,'WorldletWeb','.dev-reload'),{force:true});
 // The app reads only these at runtime (shell/release.ts); release scripts, the installer script and
 // the Store screenshots (~19 MB) are read from the checkout and stay out of the package.
 mkdirSync(path.join(dir,'distribution'));
 for(const name of ['Updates.json','Analytics.json'])copyFileSync(path.join(root,'platform/electron/distribution',name),path.join(dir,'distribution',name));
 writeFileSync(path.join(dir,'build-info.json'),JSON.stringify({...info,platform:platform==='win32'?'windows':platform==='darwin'?'macos':'linux',architecture:arch==='universal'?'universal':target,distributionChannel:channel,sourceCommit:git(root,'rev-parse','HEAD'),sourceDirty:!!git(root,'status','--porcelain')},null,2)+'\n');
 const env={...process.env,WORLDLET_TARGET_ARCH:target==='x64'?'x86_64':'arm64'};
 if(platform==='darwin'){
  run('python3',['scripts/bundle-hermes-bootstrap.py',path.join(dir,'HermesBootstrap')],env);
  const contents=path.join(staging,'stripe-'+target);
  run(process.execPath,['-e',`import('./scripts/bundle-stripe.ts').then(m=>m.bundleStripe(${JSON.stringify(contents)}))`],env);
  copyFileSync(path.join(contents,'Helpers/stripe'),path.join(dir,'stripe'));chmodSync(path.join(dir,'stripe'),0o755);
 }else if(platform==='linux'){
  run('python3',['scripts/bundle-hermes-bootstrap.py',path.join(dir,'HermesBootstrap')],{...env,WORLDLET_TARGET_OS:'linux'});
 }else{
  // Windows bootstrap (uv.exe + pinned requirements) is produced by its own Python script.
  run(python,['scripts/bundle-hermes-windows.py',path.join(dir,'HermesBootstrap')]);
 }
 const googleStage=path.join(staging,'google-'+target);
 const google=spawnSync(python,['scripts/google-oauth-bundle.py',googleStage,...(sign?['--required']:[])],{cwd:root,stdio:'inherit'});
 if(google.status!==0)throw Error(`Google OAuth registration staging failed (${google.error?.message??google.status}).`);
 if(existsSync(path.join(googleStage,'Resources/GoogleOAuthClient.json')))copyFileSync(path.join(googleStage,'Resources/GoogleOAuthClient.json'),path.join(dir,'GoogleOAuthClient.json'));
 return dir;
}
const targets:('arm64'|'x64')[]=arch==='universal'?['arm64','x64']:[arch];
// The website engine (platform/web-engine, #1170) for each architecture: a nested app in Frameworks
// plus the main process's shared-surface addon on macOS, a folder in resources on Windows and Linux
// (where locateEngine looks). A Linux engine is built only on Linux.
const engines:Record<string,string>={};
if(platform==='darwin'||platform==='win32'||(platform==='linux'&&process.platform==='linux'))for(const target of targets)engines[target]=realpathSync(await buildWebEngine({arch:target,sign:false}));
function placeEngine(buildPath:string,target:string){
 const engine=engines[target];if(!engine)return;
 if(platform==='darwin'){
  const contents=path.join(buildPath,'Worldlet.app/Contents');
  run('ditto',['--noextattr',path.join(engine,'Worldlet Web.app'),path.join(contents,'Frameworks/Worldlet Web.app')]);
  copyFileSync(path.join(engine,'worldlet_surfaces.node'),path.join(contents,'Resources/worldlet_surfaces.node'));
 }else cpSync(path.join(engine,engineFolder(platform)),path.join(buildPath,'resources',engineFolder(platform)),{recursive:true});
}
const staged=Object.fromEntries(await Promise.all(targets.map(async target=>{
 const dir=resources(target);
 await packageAgentBrowser(root,dir,`${platform}-${target}`);
 // Messages (iMessage) reads and sends through the pinned imsg release (scripts/package-imsg.ts).
 if(platform==='darwin')await packageImsg(root,dir);
 return [target,dir];
})));
// 3. Package. Each architecture copies its own helpers; universal merges the Mach-O pairs.
const entitlements=path.join(root,'platform/electron/distribution/entitlements.mac.plist');
const identity=process.env.WORLDLET_SIGN_IDENTITY;
if(sign&&platform==='darwin'&&!/^Developer ID Application: /.test(identity??''))throw Error('Set WORLDLET_SIGN_IDENTITY to a Developer ID Application identity.');
const out=path.join(root,'dist/packages');
// Installed apps (Sparkle-based and Electron-based) find updates through these keys.
const updates=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/Updates.json'),'utf8'));
// Icons come from the brand master: .icns for Mac, the committed .ico for Windows.
async function icon(){
 if(platform!=='darwin')return path.join(root,'resources/styles/builtin/assets/brand/worldlet.ico');
 return macIcon(root,path.join(staging,'Worldlet.icns'));
}
const options={
 dir:app,out,overwrite:true,platform,arch,asar:true,prune:false,
 electronVersion:JSON.parse(readFileSync(path.join(root,'node_modules/electron/package.json'),'utf8')).version,
 name:'Worldlet',executableName:platform==='linux'?'worldlet':'Worldlet',
 // Windows FileVersion is <version>.<build> (scripts/release-smoke.mjs); Mac CFBundleVersion is the build.
 appVersion:info.version,buildVersion:platform==='win32'?`${info.version}.${info.build}`:String(info.build),appCopyright:`© ${new Date(info.builtAt).getUTCFullYear()} Worldlet`,
 icon:await icon(),
 appBundleId:'app.worldlet.mac',helperBundleId:'app.worldlet.mac.helper',appCategoryType:'public.app-category.productivity',
 extraResource:[],
 // imsg ships as one signed universal binary, so both architectures carry the same file.
 osxUniversal:platform==='darwin'&&arch==='universal'?{x64ArchFiles:'Contents/Resources/imsg/imsg'}:undefined,
 // Runs once per architecture; `buildPath` is that architecture's staging root. It runs before packager signs (Mac,
 // after the universal merge) and before it edits Windows resources, so the fuses are flipped before any signature.
 afterCopyExtraResources:[async({buildPath,arch:target}:{buildPath:string,arch:string})=>{cpSync(staged[target==='x64'?'x64':'arm64'],platform==='darwin'?path.join(buildPath,'Worldlet.app/Contents/Resources'):path.join(buildPath,'resources'),{recursive:true});placeEngine(buildPath,target==='x64'?'x64':'arm64');await flipAppFuses(buildPath,platform,arch!=='universal');}],
 extendInfo:platform==='darwin'?{
  LSMinimumSystemVersion:'14.0',SUFeedURL:arch==='x64'?updates.intelFeedURL:updates.feedURL,SUPublicEDKey:updates.publicKey,CFBundleDisplayName:'Worldlet',NSHighResolutionCapable:true,WorldletDistributionChannel:channel,
  // Shared with the Dev/worktree app (scripts/dev-electron.ts).
  ...macUsageDescriptions
 }:undefined,
 osxSign:sign&&platform==='darwin'?{identity,ignore:sealedNotSigned,optionsForFile:()=>({hardenedRuntime:true,entitlements})}:undefined, // code only (#1105)
 osxNotarize:notarize&&platform==='darwin'&&process.env.WORLDLET_NOTARY_PROFILE?{keychainProfile:process.env.WORLDLET_NOTARY_PROFILE}:undefined,
 win32metadata:platform==='win32'?{CompanyName:'Worldlet',FileDescription:'Worldlet',ProductName:'Worldlet',InternalName:'Worldlet','requested-execution-level':'asInvoker'}:undefined
} as any;
// @electron/osx-sign signs every file of the bundle with a secure timestamp, so one unanswered timestamp
// request fails the signature, and packager only warns and returns an unsigned app (02, 2026-10-01:
// "The timestamp service is not available", #1036). A signed build is verified and packaged again
// after a pause, three attempts in all; then it fails here instead of later in the release.
// Each file's codesign also retries its own unanswered timestamp request (scripts/codesign-retry.mjs).
if(sign&&platform==='darwin')installCodesignRetry();
const signedApp=(output:string)=>spawnSync('codesign',['--verify','--deep','--strict',path.join(output,'Worldlet.app')],{stdio:'ignore'}).status===0;
let paths:string[]=[];
for(let attempt=1;;attempt++){
 paths=await packager(options);
 if(!(sign&&platform==='darwin')||paths.every(signedApp))break;
 if(attempt===3)throw Error('Code signing failed in three packaging attempts; see the codesign warnings above. The app is not signed.');
 console.log(`Signature incomplete after packaging attempt ${attempt}; packaging again in 60 s.`);
 await new Promise(resolve=>setTimeout(resolve,60000));
}
rmSync(staging,{recursive:true,force:true});
// The Windows installer reads the package identity and icon from the payload root.
if(platform==='win32')for(const output of paths){
 writeFileSync(path.join(output,'build-identity.json'),readFileSync(path.join(output,'resources/build-info.json')));
 copyFileSync(path.join(root,'resources/styles/builtin/assets/brand/worldlet.ico'),path.join(output,'Worldlet.ico'));
}
for(const output of paths)console.log('Packaged '+path.relative(root,output));
