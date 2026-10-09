import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile,execFileSync,spawn} from 'node:child_process';
import {app} from 'electron';
import {ensureDirectory,readJSON,writeJSON,WorldletError} from '../../files.ts';
import {AGENT,ANALYTICS,type AgentService,type AnalyticsService,type AppUpdatesService} from '../../host/services.ts';
import {timingBucket,updateWaitBucket} from '../../../../../core/diagnostics/index.ts';
import {demotedChannel,followedChannel,isUpdateChannel,pickUpdate,switchUpdateChannel,updateChannelOptions,updateChannelSwitchable,type UpdateChannel} from '../../../../../core/distribution/index.ts';
import {outliveQuit,relaunchAfterQuit} from '../../host/quit.ts';
import type {Host,Row} from '../../host/types.ts';
import {machineCredential} from './machine-credential.ts';
import {buildInfo,buildNumber,distribution,packagedRelease,releaseBuild,versionText} from './release.ts';
import {acceptanceReportPath,updateAcceptance,type UpdateAcceptance} from './update-acceptance.ts';
import {downloadWindowsInstaller,fetchWindowsRelease,readManifest,retryStalled,stallGuard,UPDATE_STALLED,updaterAgent,verifyWindowsInstaller,windowsUpdateTest,WINDOWS_ALPHA_MANIFEST_URL,WINDOWS_MANIFEST_URL,WINDOWS_ORIGIN,type WindowsRelease} from './windows-release.ts';

const SYSTEM_PATH='/usr/bin:/bin:/usr/sbin:/sbin';
const run=(file:string,args:string[],timeout=120_000)=>new Promise<{stdout:string,stderr:string}>((resolve,reject)=>{
 execFile(file,args,{timeout,maxBuffer:4_000_000,env:{PATH:SYSTEM_PATH}},(error,stdout,stderr)=>error?reject(error):resolve({stdout:String(stdout),stderr:String(stderr)}));
});
const message=(error:unknown,fallback:string)=>error instanceof WorldletError?error.message:fallback;

const CHANNEL='worldlet.update.channel',ALLOW_LOWER='worldlet.update.allowLower';
/** `<build>:<epoch ms>` of the newest update made ready, until a launch runs that Build or newer (`update_applied`). */
const PREPARED='worldlet.update.prepared';
/** The Build the previous launch ran (`app_build_changed`). */
const LAST_BUILD='worldlet.update.lastBuild';
/** One update owner per platform. The page only sees `{state,label,detail,version,visible,enabled}` and, for
 * Settings, the update channel (core/distribution/update-channel.ts): `{channel,channels,channelNote?}`. */
export abstract class Updates implements AppUpdatesService {
 protected host:Host;
 protected state='idle';
 protected label='';
 protected detail='';
 protected version='';
 configured=false;
 private listeners:(()=>void)[]=[];
 constructor(host:Host){this.host=host;}
 onChange(listener:()=>void){this.listeners.push(listener);}
 protected notify(){for(const listener of this.listeners)try{listener();}catch{}}
 protected show(state:string,label:string,detail=''){this.state=state;this.label=label;this.detail=detail;this.notify();}
 abstract snapshot():Row;
 abstract activate(request?:Row):Promise<Row>;
 /** The owner's computer (machine-credential.ts): only there can an installed copy switch channel or follow Alpha.
 * Read again at most once a minute, so enrolling or removing the credential takes effect without a restart. */
 protected get owner():boolean {
  const now=Date.now();
  if(now-this.ownerAt>60_000){this.ownerAt=now;this.ownerSeen=!!machineCredential(this.host);}
  return this.ownerSeen;
 }
 private ownerAt=0;
 private ownerSeen=false;
 private get dev(){return this.host.profile.channel==='dev';}
 /** The channel this app follows: the Dev app follows main; an installed app Alpha (owner only) or Beta (default). */
 get channel():UpdateChannel {return this.dev?'dev':followedChannel(this.host.preferences.string(CHANNEL),this.owner);}
 /** Set after switching to a more stable channel: its newest build installs even with a lower Build. */
 protected get allowLower(){return this.host.preferences.bool(ALLOW_LOWER);}
 protected settle(settled:boolean){if(settled&&this.allowLower)this.host.preferences.remove(ALLOW_LOWER);}
 /** Before each check: a copy that followed Alpha off the owner's computer moves back to Beta, installing Beta's
 * newest even when its Build is lower, like any switch to a steadier channel. */
 protected reconcile(){
  const moved=this.dev?null:demotedChannel(this.host.preferences.string(CHANNEL),this.owner);
  if(!moved)return;
  this.host.preferences.set(CHANNEL,moved.channel);
  this.host.preferences.set(ALLOW_LOWER,moved.allowLower||undefined);
 }
 protected channels(note=''):Row {
  const who={dev:this.dev,owner:this.owner},switchable=this.configured&&updateChannelSwitchable(who);
  const options=updateChannelOptions(who);
  return {channel:this.channel,switchable,installed:{version:versionText(this.host),build:buildNumber(this.host)},channels:switchable?options:options.map(o=>({...o,available:false})),...(note||!this.configured?{channelNote:note||(this.dev?'This Dev app follows main from its checkout.':'Only an installed copy of Worldlet updates itself.')}:{})};
 }
 /** Follows `to` from the next check on; false when nothing changed. Only an installed copy on the owner's computer
 * switches; the Dev app and every other copy refuse whatever the page asks. */
 protected follow(to:unknown):boolean {
  if(!this.configured||!isUpdateChannel(to))throw new WorldletError('This copy of Worldlet cannot change its update channel.');
  const who={dev:this.dev,owner:this.owner};
  if(!updateChannelSwitchable(who))throw new WorldletError(this.dev?'The Dev app follows main and never switches channel.':'Only the owner can change the update channel.');
  const option=updateChannelOptions(who).find(o=>o.id===to);
  if(!option?.available)throw new WorldletError(option?.reason||'This channel is not available.');
  const from=this.channel;
  if(from===to)return false;
  this.host.preferences.set(CHANNEL,to);
  this.host.preferences.set(ALLOW_LOWER,switchUpdateChannel(from,to).allowLower||undefined);
  return true;
 }
 start(){}
 check(){}
 quit(){}
 // Analytics (core/diagnostics/ANALYTICS.md): Builds and coarse buckets only, never a URL or an error text.
 protected report(event:string,duration='',dimensions:Row={}){try{this.host.optional<AnalyticsService>(ANALYTICS)?.recordProductEvent(event,duration,dimensions);}catch{}}
 /** An update is downloaded, verified and waits for Update: `update_prepared` once per Build, timed from the start of
  * the check (Mac) or download (Windows) that found it. */
 protected prepared(build:number,startedAt:number,user:boolean){
  const [seen]=(this.host.preferences.string(PREPARED)??'').split(':');
  if(seen===String(build))return;
  this.host.preferences.set(PREPARED,`${build}:${Date.now()}`);
  this.report('update_prepared',timingBucket(Date.now()-startedAt),{trigger:user?'user':'background'});
 }
 /** At launch: the Build a prepared update named is running now, so it was applied; how long it waited for Update. */
 protected landed(current:number){
  const [build,at]=(this.host.preferences.string(PREPARED)??'').split(':').map(Number);
  if(!build||current<build)return;
  this.host.preferences.remove(PREPARED);
  const wait=updateWaitBucket(Date.now()-at);
  this.report('update_applied','',wait?{update_wait:wait}:{});
 }
 /** At launch: the first run of a new Build reports `app_build_changed` with the Build before it (`from_build`), however
  * the new one arrived (Update, a reinstall, a store); `update_applied` only knows updates this app prepared itself. */
 protected launched(current:number){
  const previous=Number(this.host.preferences.string(LAST_BUILD));
  if(previous===current)return;
  this.host.preferences.set(LAST_BUILD,String(current));
  if(Number.isSafeInteger(previous)&&previous>0)this.report('app_build_changed','',{from_build:String(previous)});
 }
 /** The version the updater names in its User-Agent (worker/update-checks.ts). */
 protected get agentVersion(){return versionText(this.host)||String(buildNumber(this.host));}
 /** `update_failed` at most once per stage per launch: an offline computer's hourly checks are one failure. */
 protected failed(stage:'check'|'folder'|'download'|'prepare'|'install',error?:unknown){
  if(this.failures.has(stage))return;this.failures.add(stage);
  this.report('update_failed','',stage==='prepare'?{update_stage:stage,update_error:prepareError(error)}:{update_stage:stage});
 }
 private failures=new Set<string>();
}

const WORTH_SHOWING=new Set(['available','ready','installing','error']);
const FINISH_LATEST='worldlet.update.finishLatest',ATTEMPTED_BUILD='worldlet.update.attemptedBuild';
interface FeedItem {build:number;version:string;url:string;length:number;signature:string;minimumSystemVersion:string}
interface Staged {build:number;version:string;app:string;executable:string}
/** A failed Mac prepare names its check, so `update_failed` says which one (`update_error`), never the error text. */
class PrepareError extends WorldletError {readonly check:string;constructor(check:string,message:string){super(message);this.check=check;}}
function prepareError(error:unknown,check='other'){
 if(error instanceof PrepareError)return error.check;
 const failure=error as NodeJS.ErrnoException&{killed?:boolean};
 if(failure?.code==='ENOSPC'||/No space left on device/i.test(String(failure?.message)))return 'disk';
 return failure?.killed?'timeout':check;
}
const entity=(text:string)=>text.replace(/&(amp|lt|gt|quot|apos);/g,(_m,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[name]);
/** Items of a Sparkle appcast that this app could install. `loopback` (the #1140 acceptance feed's origin)
 * also admits archives served by that same local origin. */
export function parseAppcast(text:string,loopback=''):FeedItem[] {
 const items:FeedItem[]=[];
 for(const [,body] of text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)){
  if(/<sparkle:informationalUpdate\b/.test(body))continue;
  const tag=(name:string)=>body.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  const enclosure=body.match(/<enclosure\b([^>]*?)\/?>/)?.[1]??'';
  const attribute=(name:string)=>{const value=enclosure.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];return value===undefined?undefined:entity(value);};
  const build=Number(tag('sparkle:version')??attribute('sparkle:version'));
  const url=attribute('url')??'',length=Number(attribute('length')),signature=attribute('sparkle:edSignature')??'';
  if(!Number.isSafeInteger(build)||build<1||!(url.startsWith('https://')||loopback&&url.startsWith(loopback+'/'))||!Number.isSafeInteger(length)||length<1||length>2_000_000_000||!/^[A-Za-z0-9+/]{86}==$/.test(signature))continue;
  items.push({build,version:entity(tag('sparkle:shortVersionString')??attribute('sparkle:shortVersionString')??String(build)),url,length,signature,minimumSystemVersion:tag('sparkle:minimumSystemVersion')??'0'});
 }
 return items;
}
const compareVersions=(a:string,b:string)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;};

/** Mac: the Sparkle feeds installed people already use. Like Sparkle, the archive's Ed25519
 * signature is checked against the published key before it is opened; the new app must keep
 * the bundle identifier and Developer ID team. Everything is downloaded, unpacked and verified in
 * the background before Update appears; a prepared update waits in `<library>/updates/staged/<build>/`,
 * and Update applies exactly that one at once: the app bundle is swapped by rename while Worldlet
 * quits and relaunches (an ordinary quit installs it without relaunching). A newer build found
 * while one is prepared is prepared beside it, and Update keeps applying the prepared one meanwhile.
 * The replaced bundle is removed on the next launch. An RC acceptance launch (update-acceptance.ts)
 * reads its loopback feed instead, installs at once and relaunches into a window capture. */
export class MacUpdates extends Updates {
 private feed='';
 private alphaFeed='';
 private key:crypto.KeyObject|null=null;
 private busy=false;
 private requestedInstall=false;
 private staged:Staged|null=null;
 private relaunch=false;
 private timer:ReturnType<typeof setInterval>|null=null;
 private abort=new AbortController();
 private readonly current:number;
 private readonly bundle:string;
 private readonly acceptance:UpdateAcceptance|null;
 constructor(host:Host){
  super(host);
  const config=distribution(host,'Updates.json')??{};
  let acceptance:UpdateAcceptance|null=null;
  try{acceptance=packagedRelease(host)?updateAcceptance(process.argv):null;}catch{}
  this.acceptance=acceptance;
  const feed=acceptance?acceptance.feed:process.arch==='x64'&&typeof config.intelFeedURL==='string'?config.intelFeedURL:config.feedURL;
  const raw=typeof config.publicKey==='string'?Buffer.from(config.publicKey,'base64'):Buffer.alloc(0);
  this.bundle=path.resolve(process.execPath,'../../..');
  this.current=buildNumber(host);
  this.configured=process.platform==='darwin'&&(releaseBuild(host)||!!acceptance)&&typeof feed==='string'&&(!!acceptance||feed.startsWith('https://'))&&raw.length===32&&this.bundle.endsWith('.app')&&this.current>0;
  // Alpha's feed sits beside the release feed (scripts/release-alpha.mjs); both carry the universal DMG.
  if(this.configured){this.feed=feed;this.alphaFeed=String(config.feedURL).replace(/\/appcast\.xml$/,'/appcast-alpha.xml');this.key=crypto.createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:raw.toString('base64url')},format:'jwk'});}
 }
 /** A prepared update applies at once, even while a newer one is still being prepared beside it. */
 private get enabled(){return this.configured&&(this.state==='ready'&&!!this.staged||this.state==='installing'||this.state==='error'&&!this.busy);}
 snapshot(){return {state:this.state,label:this.label,detail:this.detail,version:this.version,visible:WORTH_SHOWING.has(this.state),enabled:this.enabled,...this.channels()};}
 /** The feed of the followed channel; the RC acceptance feed overrides it. */
 private get channelFeed(){return this.acceptance||this.channel!=='alpha'?this.feed:this.alphaFeed;}
 override start(){
  if(!this.configured)return;
  this.cleanup();
  if(!this.acceptance){this.launched(this.current);this.landed(this.current);}
  if(this.acceptance){this.requestedInstall=true;void this.run(true).then(()=>this.finishAcceptance());return;}
  // After an Update click: an unchanged Build means the swap did not happen. Otherwise any newer build
  // is prepared in the background like every other, never installed without another click.
  if(!this.host.preferences.bool(FINISH_LATEST)||this.resumeLatestRequest(String(this.current)))void this.run(false);
  this.timer=setInterval(()=>{if(!this.busy&&this.state!=='installing')void this.run(false);},3_600_000);
  this.timer.unref?.();
 }
 /** A check while an update is prepared keeps Update showing; a newer build is prepared quietly beside it. */
 override check(){if(!this.configured||this.busy)return;if(!this.staged)this.show('checking','Checking…');void this.run(true);}
 /** A prepared update from the previous channel is dropped; the new channel is checked at once. */
 private switched(){
  this.staged=null;this.version='';this.requestedInstall=false;this.clearLatestRequest();
  fs.rmSync(path.join(this.host.profile.root,'updates','staged'),{recursive:true,force:true});
  if(this.busy){this.recheck=true;return;}
  this.show('checking','Checking…');void this.run(true);
 }
 private recheck=false;
 private rememberLatestRequest(){this.host.preferences.set(FINISH_LATEST,true);this.host.preferences.set(ATTEMPTED_BUILD,String(this.current));}
 private clearLatestRequest(){this.host.preferences.remove(FINISH_LATEST,ATTEMPTED_BUILD);}
 /** False when the Build did not change after an Update click (shown as Retry update). */
 private resumeLatestRequest(installed:string){
  const unchanged=this.host.preferences.string(ATTEMPTED_BUILD)===installed;
  this.clearLatestRequest();
  if(unchanged){this.failed('install');this.show('error','Retry update','The previous update did not change the installed version.');}
  return !unchanged;
 }
 async activate(request:Row={}){
  if(request.operation==='status')return this.snapshot();
  if(request.operation==='channel'){if(this.follow(request.channel))this.switched();}
  else if(request.operation==='check')this.check();
  // Update applies the prepared build at once: no check or download between the click and the restart.
  else if((this.state==='ready'||this.state==='installing'||request.operation==='update')&&this.staged){this.rememberLatestRequest();this.installNow();}
  // Fox's Update Worldlet button (an out-of-date app) with nothing prepared yet: prepare, then install.
  else if(request.operation==='update'&&this.configured){
   this.rememberLatestRequest();this.requestedInstall=true;
   if(!this.busy){this.show('checking','Checking latest update…');void this.run(true);}
  }
  // Retry prepares again in the background; Update appears once it is ready.
  else if(this.state==='error'&&this.configured&&!this.busy){this.show('checking','Checking…');void this.run(true);}
  return this.snapshot();
 }
 private async run(user:boolean){
  if(this.busy)return;
  this.busy=true;
  if(!this.acceptance)this.reconcile();
  const feed=this.channelFeed,startedAt=Date.now();
  let stage:'check'|'folder'|'download'|'prepare'='check';
  try{
   const item=await this.latest(feed);
   if(!item){
    if(user||this.requestedInstall){this.requestedInstall=false;this.clearLatestRequest();this.show('current','Up to date');}
    return;
   }
   if(this.staged?.build!==item.build){
    stage='folder';
    try{fs.accessSync(path.dirname(this.bundle),fs.constants.W_OK);}
    catch{throw new WorldletError('Worldlet cannot update itself in this folder. Install the current version from the Worldlet download page.');}
    // While one build is prepared, a newer one is prepared silently beside it; Update keeps applying the prepared one.
    const quiet=!!this.staged&&!this.requestedInstall;
    if(!quiet)this.show('downloading',user?'Downloading…':'Downloading update…',`Worldlet ${item.version}`);
    stage='download';
    const file=await retryStalled(()=>this.download(item,user&&!quiet),this.abort.signal);
    if(!quiet)this.show('preparing','Preparing update…',`Worldlet ${item.version}`);
    stage='prepare';
    const staged=await this.prepare(file,item);
    // The channel changed while this one downloaded, or Update already applied the previous one: not the one to install.
    if(feed!==this.channelFeed||this.state==='installing'){fs.rmSync(path.dirname(staged.app),{recursive:true,force:true});return;}
    if(this.staged)fs.rmSync(path.dirname(this.staged.app),{recursive:true,force:true});
    this.staged=staged;
    if(!this.acceptance)this.prepared(staged.build,startedAt,user);
   }
   this.version=this.staged!.version;
   if(this.requestedInstall)this.installNow();
   else this.show('ready','Update',`Worldlet ${item.version}${item.build<this.current?' ('+this.channel[0].toUpperCase()+this.channel.slice(1)+')':''} is ready. Update restarts into it now.`);
  }catch(error){
   if(this.abort.signal.aborted||this.state==='installing')return;
   if(!this.acceptance)this.failed(stage,error);
   this.requestedInstall=false;
   // A prepared update stays ready when preparing a newer one fails.
   if(this.staged){this.show('ready','Update',`Worldlet ${this.staged.version} is ready. Update restarts into it now.`);return;}
   this.show('error','Retry update',message(error,'The update could not be checked or prepared. Try again later.'));
  }finally{
   this.busy=false;this.notify();
   if(this.recheck){this.recheck=false;this.show('checking','Checking…');void this.run(true);}
  }
 }
 private async appcast(feed:string){
  try{
   const response=await fetch(feed,{signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(30_000)]),headers:{'User-Agent':`Worldlet/${versionText(this.host)||this.current} Sparkle/2`}});
   if(!response.ok)throw Error(String(response.status));
   return (await readManifest(response,4_000_000)).toString('utf8');
  }catch(error){if(error instanceof WorldletError)throw error;throw new WorldletError('Could not check for updates. Check your connection and try again.');}
 }
 private async latest(feed:string){
  // Alpha is never behind Beta: a release whose RC never reached the Alpha feed is still offered on Alpha.
  const texts=await Promise.all(feed===this.alphaFeed?[feed,this.feed].map(f=>this.appcast(f)):[this.appcast(feed)]);
  const system=process.getSystemVersion();
  const items=texts.flatMap(text=>parseAppcast(text,this.acceptance?.origin)).filter(item=>compareVersions(item.minimumSystemVersion,system)<=0);
  // A newer Build; after switching to a more stable channel, its newest even when lower (core/distribution/update-channel.ts).
  const pick=pickUpdate(items.map(item=>item.build),this.current,!this.acceptance&&this.allowLower);
  if(!this.acceptance)this.settle(pick.settled);
  return items.find(item=>item.build===pick.build)??null;
 }
 private async download(item:FeedItem,user:boolean){
  const dir=ensureDirectory(path.join(this.host.profile.root,'updates'));
  const partial=path.join(dir,`${item.build}.dmg.partial`),file=path.join(dir,`${item.build}.dmg`);
  fs.rmSync(partial,{force:true});
  const stall=stallGuard();
  try{
   const response=await fetch(item.url,{signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(1_800_000),stall.signal]),headers:updaterAgent(this.agentVersion)});
   const declared=Number(response.headers.get('content-length'));
   if(!response.ok||!response.body||declared&&declared!==item.length)throw new WorldletError('The update could not be downloaded. Retry to check the release again.');
   const out=fs.openSync(partial,'wx',0o600);
   let received=0;
   try{
    for await (const chunk of response.body as any as AsyncIterable<Uint8Array>){
     stall.touch();received+=chunk.length;
     if(received>item.length)throw new WorldletError('The update exceeds its published size.');
     fs.writeSync(out,chunk);
     if(user){const next=`Downloading ${Math.min(100,Math.floor(received/item.length*100))}%`;if(next!==this.label)this.show('downloading',next,this.detail);}
    }
   }finally{fs.closeSync(out);}
   if(received!==item.length)throw new WorldletError('The update download was incomplete. Retry to check the release again.');
   // Sparkle signs the archive bytes with Ed25519; nothing is opened before this passes.
   if(!crypto.verify(null,fs.readFileSync(partial),this.key!,Buffer.from(item.signature,'base64')))throw new WorldletError('The update signature could not be verified.');
   fs.renameSync(partial,file);
   return file;
  }catch(error){
   fs.rmSync(partial,{force:true});
   if(stall.stalled&&!this.abort.signal.aborted)throw new WorldletError(UPDATE_STALLED);
   if(error instanceof WorldletError||this.abort.signal.aborted)throw error;
   throw new WorldletError('The update could not be downloaded. Retry to check the release again.');
  }finally{stall.stop();}
 }
 private async prepare(file:string,item:FeedItem):Promise<Staged> {
  // Each build is unpacked in its own folder, so a prepared one stays intact while a newer one is prepared.
  const updates=path.join(this.host.profile.root,'updates'),staging=path.join(updates,'staged',String(item.build));
  fs.rmSync(staging,{recursive:true,force:true});ensureDirectory(staging);
  const mount=fs.mkdtempSync(path.join(updates,'mount-'));
  const target=path.join(staging,path.basename(this.bundle));
  try{
   await run('/usr/bin/hdiutil',['attach','-nobrowse','-readonly','-noautoopen','-mountpoint',mount,file],300_000).catch(error=>{throw new PrepareError(prepareError(error,'open'),'The update disk image could not be opened.');});
   try{
    const apps=fs.readdirSync(mount).filter(name=>name.endsWith('.app')&&fs.lstatSync(path.join(mount,name)).isDirectory());
    if(apps.length!==1)throw new PrepareError('contents','The update does not contain one Worldlet app.');
    await run('/usr/bin/ditto',[path.join(mount,apps[0]),target],600_000).catch(error=>{throw new PrepareError(prepareError(error,'copy'),'The update could not be unpacked.');});
   }finally{await run('/usr/bin/hdiutil',['detach',mount,'-force']).catch(()=>{});}
  }finally{fs.rmSync(mount,{recursive:true,force:true});fs.rmSync(file,{force:true});}
  const plist=(bundle:string,key:string)=>run('/usr/bin/plutil',['-extract',key,'raw','-o','-',path.join(bundle,'Contents/Info.plist')]).then(r=>r.stdout.trim(),()=>'');
  const team=(bundle:string)=>run('/usr/bin/codesign',['-dv','--verbose=2',bundle]).then(r=>/TeamIdentifier=([A-Z0-9]{10})/.exec(r.stderr)?.[1]??'',()=>'');
  try{
   if(Number(await plist(target,'CFBundleVersion'))!==item.build)throw new PrepareError('build','The update does not match its published release.');
   const identifier=await plist(target,'CFBundleIdentifier');
   if(!identifier||identifier!==await plist(this.bundle,'CFBundleIdentifier'))throw new PrepareError('identity','The update belongs to a different app.');
   await run('/usr/bin/codesign',['--verify','--deep','--strict',target],300_000).catch(error=>{throw new PrepareError(prepareError(error,'signature'),'The update is not correctly signed.');});
   const expected=await team(this.bundle);
   if(expected&&await team(target)!==expected)throw new PrepareError('team','The update is signed by a different developer.');
   const executable=await plist(target,'CFBundleExecutable');
   if(!executable||executable.includes('/'))throw new PrepareError('incomplete','The update app is incomplete.');
   return {build:item.build,version:item.version,app:target,executable};
  }catch(error){fs.rmSync(staging,{recursive:true,force:true});throw error;}
 }
 private installNow(){
  this.relaunch=true;
  this.show('installing','Restarting…','If Worldlet is still open, click to retry restarting.');
  setTimeout(()=>app.quit(),100);
 }
 /** Runs while the app quits: the prepared bundle replaces the running one by rename. */
 override quit(){
  this.abort.abort();
  if(this.timer)clearInterval(this.timer);
  const staged=this.staged;
  if(!staged||!fs.existsSync(staged.app))return;
  this.staged=null;
  const previous=`${this.bundle}.previous-${crypto.randomUUID().slice(0,8)}`;
  try{
   fs.renameSync(this.bundle,previous);
   try{fs.renameSync(staged.app,this.bundle);}
   catch(error){
    if(error?.code!=='EXDEV'){fs.renameSync(previous,this.bundle);throw error;}
    try{execFileSync('/usr/bin/ditto',[staged.app,this.bundle],{timeout:300_000,env:{PATH:SYSTEM_PATH}});}
    catch(copy){fs.rmSync(this.bundle,{recursive:true,force:true});fs.renameSync(previous,this.bundle);throw copy;}
   }
   if(this.relaunch)relaunchAfterQuit({execPath:path.join(this.bundle,'Contents/MacOS',staged.executable),args:this.acceptance?['--window-capture',this.acceptance.capture]:[]});
  }catch(error){this.host.diagnostics.record(error,'appUpdate');}
 }
 /** An acceptance run that is not relaunching reports its state beside the capture and quits. */
 private finishAcceptance(){
  if(!this.acceptance||this.state==='installing')return;
  try{fs.writeFileSync(acceptanceReportPath(this.acceptance.capture),JSON.stringify({format:'worldlet-update-acceptance/1',state:this.state,label:this.label,detail:this.detail,build:this.current},null,2));}
  catch(error){this.host.diagnostics.record(error,'appUpdate');}
  app.quit();
 }
 private cleanup(){
  const parent=path.dirname(this.bundle),name=path.basename(this.bundle)+'.previous-';
  try{for(const entry of fs.readdirSync(parent))if(entry.startsWith(name))fs.rmSync(path.join(parent,entry),{recursive:true,force:true});}catch{}
  const updates=path.join(this.host.profile.root,'updates');
  try{for(const entry of fs.readdirSync(updates))if(entry.startsWith('mount-')||entry.endsWith('.partial')||entry.endsWith('.dmg')||entry==='staged')fs.rmSync(path.join(updates,entry),{recursive:true,force:true});}catch{}
 }
}

/** Windows: the preview manifest and SHA-256 verified installer. A newer Build is downloaded and verified in
 * the background as soon as a check finds it (at launch and hourly); Update appears only then, and a click
 * runs that installer at once, silently, with `/WAITPID` and `/RESTARTAPP`: Worldlet quits, the installer
 * replaces it and reopens it. A newer Build found while one is ready downloads beside it; Update keeps
 * installing the ready one meanwhile. A Store or Steam installation is updated by that store, so the
 * updater stays out of its way.
 * The RC update acceptance (#1141) sets WORLDLET_WINDOWS_UPDATE_TEST to a loopback manifest and runs
 * on its own throwaway WorldletUpdateAcceptance-<8 hex> profile; only then does this updater use that
 * manifest and check, download and install unattended (installer `/S`, no reopen). Any other launch ignores it. */
export class WindowsUpdates extends Updates {
 /** The newest Build a check offered that is not ready yet. */
 private release:WindowsRelease|null=null;
 /** The verified installer Update runs. */
 private ready:{release:WindowsRelease,installer:string}|null=null;
 private gate=false;
 private action=false;
 private timer:ReturnType<typeof setInterval>|null=null;
 private abort=new AbortController();
 private readonly current:number;
 private readonly directory:string;
 private readonly managedBy:string|null;
 private readonly test:string|null;
 constructor(host:Host){
  super(host);
  this.current=buildNumber(host);
  this.directory=path.join(host.profile.root,'updates');
  const channel=buildInfo(host).distributionChannel;
  this.managedBy=process.platform!=='win32'?null:process.windowsStore||channel==='microsoft-store'?'Microsoft Store':channel==='steam'?'Steam':null;
  this.configured=process.platform==='win32'&&!this.managedBy&&releaseBuild(host)&&this.current>0;
  const test=windowsUpdateTest(process.env.WORLDLET_WINDOWS_UPDATE_TEST),profile=process.env.WORLDLET_WINDOWS_PROFILE||'';
  this.test=test&&/^WorldletUpdateAcceptance-[0-9a-f]{8}$/.test(profile)&&path.basename(host.profile.root)===profile?test:null;
 }
 snapshot(){
  if(this.managedBy)return {state:'managed',detail:`Updates are managed by ${this.managedBy}.`,label:`${this.managedBy} updates`,visible:false,enabled:false,...this.channels(`${this.managedBy} keeps this copy up to date.`)};
  const labels:Record<string,string>={available:'Update available',ready:'Update',error:'Retry update',current:'Up to date',downloading:'Downloading…',checking:'Checking…'};
  return {state:this.state,version:this.ready?.release.version??this.release?.version??'',detail:this.detail,label:labels[this.state]??'Updating…',
   visible:['ready','error','installing'].includes(this.state),enabled:['ready','error'].includes(this.state),...this.channels()};
 }
 private set(state:string,detail:string){this.state=state;this.detail=detail;this.notify();}
 private showReady(){const release=this.ready!.release;this.set('ready',`Worldlet ${release.version} · Build ${release.build} is downloaded and verified. Update restarts into it now; your personal data is kept.`);}
 override start(){
  if(!this.configured)return;
  // Earlier installers and interrupted downloads are stale once a new process owns the library.
  try{for(const entry of fs.readdirSync(this.directory))if(/\.partial$|-windows-x64-unsigned\.exe$/i.test(entry))try{fs.rmSync(path.join(this.directory,entry),{force:true});}catch{}}catch{}
  if(this.test){
   void this.checkNow().then(()=>this.release?this.downloadNow():undefined).then(()=>this.state==='ready'?this.install():undefined)
    .catch(error=>this.host.diagnostics.record(error,'appUpdate'));
   return;
  }
  this.launched(this.current);
  this.landed(this.current);
  void this.refresh();
  this.timer=setInterval(()=>{if(!this.gate&&this.state!=='installing')void this.refresh();},3_600_000);
  this.timer.unref?.();
 }
 /** Check, then download and verify whatever newer Build the check found. */
 private async refresh(){await this.checkNow();if(this.release)await this.downloadNow();}
 async activate(request:Row={}){
  if(request.operation==='status')return this.snapshot();
  if(request.operation==='channel'&&this.follow(request.channel)){
   // A download from the previous channel is not the one to install.
   this.release=null;this.discardReady();this.state='idle';
   if(this.gate){this.recheck=true;this.notify();return this.snapshot();}
  }
  if(!this.configured||this.action)return this.snapshot();
  this.action=true;
  try{
   // Update runs the ready installer at once; Fox's Update Worldlet button does the same when one is ready.
   if(this.ready&&(request.operation==='update'||this.state==='ready'&&!request.operation))this.install();
   // A check, a retry or Fox's button with nothing ready: the download continues in the background, pushed when ready.
   else if(!this.gate){await this.checkNow();if(this.release)void this.downloadNow();}
   return this.snapshot();
  }finally{this.action=false;}
 }
 private discardReady(){if(this.ready)try{fs.rmSync(this.ready.installer,{force:true});}catch{}this.ready=null;}
 private install(){
  this.ensureIdle();
  const ready=this.ready;
  if(!ready)throw new WorldletError('Download and verify the update first.');
  if(!verifyWindowsInstaller(ready.release,ready.installer)){
   this.ready=null;
   this.failed('install');
   this.set('error','The downloaded installer changed. Check and download the update again.');
   throw new WorldletError(this.detail);
  }
  this.ensureIdle();
  // Silent, then the installer reopens Worldlet (`/RESTARTAPP`); the acceptance relaunches the app itself.
  const installer=spawn(ready.installer,['/S','/WAITPID='+process.pid,...this.test?[]:['/RESTARTAPP']],{detached:true,stdio:'ignore'});
  // Quitting ends every child the app spawned; the installer must survive to apply the update.
  outliveQuit(installer.pid);
  installer.unref();
  this.set('installing','Restarting into the update…');
  setTimeout(()=>app.quit(),500);
 }
 private ensureIdle(){
  if(this.host.optional<AgentService>(AGENT)?.hasInteractiveWork())throw new WorldletError('Stop the current task or recording before installing the update.');
 }
 private async checkNow(){
  if(this.gate)return;
  this.gate=true;
  // While an update is ready the check runs quietly: Update stays as it is.
  const quiet=()=>!!this.ready;
  try{
   if(!quiet())this.set('checking','');
   if(!this.test)this.reconcile();
   const alpha=!this.test&&this.channel==='alpha';
   const fetched=await fetchWindowsRelease(this.abort.signal,this.test??(alpha?WINDOWS_ALPHA_MANIFEST_URL:WINDOWS_MANIFEST_URL),this.agentVersion).catch(error=>{if(alpha&&/\(404\)/.test(String(error?.message)))return null;throw error;});
   // Alpha is never behind Beta: a release whose RC never reached the Alpha manifest is still offered on Alpha.
   const beta=alpha?await fetchWindowsRelease(this.abort.signal,WINDOWS_MANIFEST_URL,this.agentVersion):null;
   const release=beta&&(!fetched||beta.build>fetched.build)?beta:fetched;
   // A newer Build; after switching to a more stable channel, its newest even when lower (core/distribution/update-channel.ts).
   const pick=pickUpdate(release?[release.build]:[],this.current,!this.test&&this.allowLower);
   if(!this.test)this.settle(pick.settled);
   const offered=pick.build===null?null:release;
   this.release=offered&&offered.build!==this.ready?.release.build?offered:null;
   if(quiet())return;
   this.set(offered?'available':'current',offered?`Worldlet ${offered.version} · Build ${offered.build} · Unsigned Windows preview${alpha?' · Alpha':''} · downloading in the background`:release||!alpha?'This Windows build is up to date.':'No Alpha build is published yet.');
  }catch{if(!this.abort.signal.aborted&&!quiet()){if(!this.test)this.failed('check');this.set('error','Could not check for updates. Check your connection and try again.');}}
  finally{
   this.gate=false;
   if(this.recheck){this.recheck=false;void this.refresh();}
  }
 }
 private recheck=false;
 private async downloadNow(){
  if(this.gate)return;
  this.gate=true;
  const quiet=()=>!!this.ready,startedAt=Date.now();
  try{
   const release=this.release;
   if(!release||release.build===this.current)throw new WorldletError('Check for a newer release first.');
   if(!quiet())this.set('downloading','Downloading and verifying the Windows installer.');
   const installer=await downloadWindowsInstaller(release,this.directory,this.abort.signal,this.test?new URL(this.test).origin:WINDOWS_ORIGIN,this.agentVersion);
   // The channel changed during the download, or Update already ran the ready one: this installer is not the one to run.
   if(this.release!==release||this.state==='installing')return;
   this.discardReady();
   this.ready={release,installer};this.release=null;
   if(!this.test)this.prepared(release.build,startedAt,false);
   this.showReady();
  }catch{
   if(this.abort.signal.aborted||this.state==='installing')return;
   // A ready update stays ready when downloading a newer one fails.
   if(!this.test)this.failed('download');
   if(quiet())this.showReady();
   else this.set('error','The update could not be downloaded or verified. Retry to check the release again.');
  }finally{
   this.gate=false;
   if(this.recheck){this.recheck=false;void this.refresh();}
  }
 }
 override quit(){this.abort.abort();if(this.timer)clearInterval(this.timer);}
}

export function createUpdates(host:Host):Updates {return process.platform==='win32'?new WindowsUpdates(host):new MacUpdates(host);}

// Dev channel ---------------------------------------------------------------------------------
// The checkout's dev launcher prepares candidates; the app only reads its status file and asks
// for one exact candidate. Electron's files: `<repo>/.local/dev/electron/.dev-update.json`
// (written by the watcher) and `.dev-apply.json` (written here) in the same folder.
const devDirectory=(host:Host)=>path.join(host.profile.resources,'.local/dev/electron');
export function devBuildStatus(host:Host):Row {
 if(host.profile.channel!=='dev')return {supported:false};
 let value:Row;
 try{value=readJSON(path.join(devDirectory(host),'.dev-update.json'));if(!value||typeof value!=='object')throw Error();}
 catch{return {supported:true,online:false};}
 const observed=typeof value.observedAt==='string'?Date.parse(value.observedAt):NaN;
 const age=Number.isFinite(observed)?(Date.now()-observed)/1000:Infinity;
 const result:Row={supported:true,online:value.online===true&&age>=0&&age<15,applying:value.applying===true};
 if(typeof value.error==='string')result.error=value.error.slice(0,400);
 const candidate=value.candidate;
 if(candidate&&typeof candidate.id==='string'&&typeof candidate.revision==='string'&&/^[a-f0-9]{24}$/.test(candidate.id)&&/^[a-f0-9]{7,40}$/.test(candidate.revision)){
  const entry:Row={id:candidate.id,revision:candidate.revision};
  if(typeof candidate.committedAt==='string'&&candidate.committedAt.length<=40)entry.committedAt=candidate.committedAt;
  if(Number.isInteger(candidate.pr)&&candidate.pr>0)entry.pr=candidate.pr;
  if(Number.isInteger(candidate.behind)&&candidate.behind>=0)entry.behind=candidate.behind;
  result.candidate=entry;
 }
 return result;
}
export function devBuildApply(host:Host,body:Row){
 const state=devBuildStatus(host);
 if(host.profile.channel!=='dev'||state.online!==true||state.applying===true||!state.candidate||body.id!==state.candidate.id)
  throw new WorldletError('No matching prepared Dev build with an active watcher.');
 writeJSON(path.join(devDirectory(host),'.dev-apply.json'),{id:state.candidate.id});
 return {accepted:true};
}
