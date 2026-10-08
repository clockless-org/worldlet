import {releaseTag,displayReleaseVersion} from '../core/distribution/index.ts';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {buildInfo} from './build-info.ts';

const info=buildInfo(),tag=releaseTag(info.version,info.build),repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA;
if(process.env.RELEASE_TAG!==tag||!repo||!sha)throw Error('Invalid release context');
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let existing;
try{existing=JSON.parse(gh('api',`repos/${repo}/releases/tags/${tag}`));}
catch(error){if(!String(error.stderr).includes('HTTP 404'))throw error;}
const assets=[];
const base=`Worldlet-${info.version}-${info.build}-macos-universal.dmg`;
for(const suffix of ['','.sha256','.notary.json'])assets.push({name:base+suffix,file:path.join('dist/releases/universal',base+suffix)});
for(const name of ['appcast.xml','appcast-intel.xml','release-identity.json'])assets.push({name,file:path.join('dist/releases',name)});
for(const asset of assets)if(!readFileSync(asset.file))throw Error('Missing release asset '+asset.file);
if(existing){
 if(existing.target_commitish!==sha)throw Error('Release tag belongs to a different commit');
 if(!existing.draft){
  for(const item of assets){
   const asset=existing.assets.find(a=>a.name===item.name);
   const digest='sha256:'+createHash('sha256').update(readFileSync(item.file)).digest('hex');
   if(asset?.digest!==digest)throw Error('Published GitHub asset differs: '+item.name);
  }
  console.log('GitHub archive already matches this release');process.exit(0);
 }
}else{
 const notes=path.join(process.env.RUNNER_TEMP,'worldlet-release-notes.md');
 const notesFile=process.env.WORLDLET_RELEASE_NOTES_FILE;
 if(!notesFile)throw Error('Prepare user-facing release notes and set WORLDLET_RELEASE_NOTES_FILE');
 const body=readFileSync(notesFile,'utf8').trim();
 if(!body)throw Error('Release notes must not be empty');
 writeFileSync(notes,`${body}\n\n---\nSource: ${sha}\n\nDownload and automatic updates: https://worldlet.clockless.workers.dev/download/\n`);
 gh('release','create',tag,'--repo',repo,'--target',sha,'--title',`Worldlet v${displayReleaseVersion(info.version,info.build)}`,'--notes-file',notes,'--draft');
}
gh('release','upload',tag,'--repo',repo,...assets.map(item=>item.file),'--clobber');
gh('release','edit',tag,'--repo',repo,'--draft=false');
console.log('Archived '+tag+' in '+repo);
