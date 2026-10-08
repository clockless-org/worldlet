import {calendarParts,nativeReleaseVersion} from '../core/distribution/index.ts';
import {workspace} from './dev-workspace.ts';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
// One committed release identity across Swift, the bundled UI and Cloudflare.
// Git checkout depth, documentation commits and build-machine clocks do not change it.
export function buildInfo(platform: 'mac' | 'windows' = process.env.WORLDLET_TARGET_PLATFORM==='windows' ? 'windows' : 'mac'){
 const manifest=process.env.WORLDLET_RELEASE_MANIFEST;
 const info=JSON.parse(readFileSync(manifest||new URL('release.json',root),'utf8'));
 const version=JSON.parse(readFileSync(new URL('package.json',root),'utf8')).version;
 if(manifest){
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(info.sourceCommit!==head)throw Error('Release manifest must belong to this exact source commit');
 }
 if((!manifest&&info.version!==version)||!/^\d+\.\d+\.\d+$/.test(info.version))throw Error('release.json and package.json versions must match');
 const build=platform==='windows' ? (info.platformBuilds?.windows ?? info.build) : (info.platformBuilds?.mac ?? info.build);
 if(!Number.isSafeInteger(build)||build<1||build>65535)throw Error('Invalid release build number');
 if(!Number.isFinite(Date.parse(info.builtAt)))throw Error('Invalid release build time');
 return {version:calendarParts(info.version)?.build ? nativeReleaseVersion(info.version,build) : info.version,build,builtAt:info.builtAt};
}
// A development build is whatever main commit it runs, so it names that commit the way every release of it
// would (2026.MMDD.<main commit count>), not the last identity committed to release.json, which stopped moving
// when releases became tags (a Dev app on 2026-10-05 main said "2026.1003.1143"). A shallow checkout cannot
// count commits and keeps release.json.
export function devBuildInfo(git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()){
 const fallback=buildInfo();
 try{
  if(git('rev-parse','--is-shallow-repository')!=='false')return fallback;
  const build=Number(git('rev-list','--count','HEAD')),committed=new Date(git('log','-1','--format=%cI','HEAD'));
  if(!Number.isSafeInteger(build)||build<fallback.build||build>65535||!Number.isFinite(committed.getTime()))return fallback;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(committed).map(x=>[x.type,x.value]));
  return {version:nativeReleaseVersion(`${p.year}.${p.month}${p.day}.${build}`,build),build,builtAt:committed.toISOString().replace(/\.\d{3}Z$/,'Z')};
 }catch{return fallback;}
}
export const buildDefines=({channel=process.env.WORLDLET_BUILD_CHANNEL||'release'}={})=>({__WORLDLET_BUILD__:JSON.stringify(channel==='dev'?devBuildInfo():buildInfo()),__WORLDLET_CHANNEL__:JSON.stringify(channel),__WORLDLET_WORKSPACE__:JSON.stringify(channel==='dev'?workspace().label:''),__WORLDLET_REVISION__:JSON.stringify(execFileSync('git',['rev-parse','--short=7','HEAD'],{cwd:root,encoding:'utf8'}).trim()),__WORLDLET_REVISION_TIME__:JSON.stringify(execFileSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'}).trim())});
if(process.argv.includes('--version'))process.stdout.write(buildInfo().version);
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(buildInfo()));
