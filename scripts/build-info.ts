import {workspace} from './dev-workspace.ts';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {BUILD_OFFSET,releaseIdentity} from './ci-release.mjs';
const root=new URL('../',import.meta.url);
// One release identity across the app, its bundled UI and every platform: a commit's Build is 4000 + its position on
// main (releaseIdentity, scripts/ci-release.mjs), the number its git tag names. A packaged build reads it from its
// manifest (WORLDLET_RELEASE_MANIFEST, bound to this exact commit); every other build counts it from Git. There is no
// committed release.json any more (owner 2026-10-11 「release.json 里的号也要更新啊 或者就别要了」).
// A shallow checkout cannot count commits; it gets Build 4000 (no commit of main has it), dated by the commit.
export function buildInfo(git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()){
 const manifest=process.env.WORLDLET_RELEASE_MANIFEST;
 if(manifest){
  const info=JSON.parse(readFileSync(manifest,'utf8'));
  if(info.sourceCommit!==git('rev-parse','HEAD'))throw Error('Release manifest must belong to this exact source commit');
  if(!/^\d+\.\d+\.\d+$/.test(info.version)||!Number.isSafeInteger(info.build)||info.build<1||info.build>65535)throw Error('Invalid release manifest');
  if(!Number.isFinite(Date.parse(info.builtAt)))throw Error('Invalid release build time');
  return {version:info.version as string,build:info.build as number,builtAt:info.builtAt as string};
 }
 const committed=git('log','-1','--format=%cI','HEAD');
 const shallow=git('rev-parse','--is-shallow-repository')!=='false';
 const {version,build,builtAt}=shallow ? releaseIdentity(1,committed,BUILD_OFFSET-1) : releaseIdentity(Number(git('rev-list','--count','HEAD')),committed);
 return {version,build,builtAt};
}
export const buildDefines=({channel=process.env.WORLDLET_BUILD_CHANNEL||'release'}={})=>({__WORLDLET_BUILD__:JSON.stringify(buildInfo()),__WORLDLET_CHANNEL__:JSON.stringify(channel),__WORLDLET_WORKSPACE__:JSON.stringify(channel==='dev'?workspace().label:''),__WORLDLET_REVISION__:JSON.stringify(execFileSync('git',['rev-parse','--short=7','HEAD'],{cwd:root,encoding:'utf8'}).trim()),__WORLDLET_REVISION_TIME__:JSON.stringify(execFileSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'}).trim())});
if(process.argv.includes('--version'))process.stdout.write(buildInfo().version);
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(buildInfo()));
