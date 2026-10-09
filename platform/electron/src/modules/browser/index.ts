import {WorldletError} from '../../files.ts';
import {bundledResource} from '../../resources.ts';
import {AGENT,BROWSER,DESKTOP_COMPANION,type AgentService,type BrowserService,type DesktopCompanionService} from '../../host/services.ts';
import {BrowserDevice} from './device.ts';
import {agentScript} from './agent.ts';
import {discoverBookmarks} from './bookmarks.ts';
import {websiteSession} from './surface.ts';
import {YouTubePlayer,YouTubeService} from './youtube.ts';
import {StripeService} from './stripe.ts';
import {parse} from './rules.ts';
import type {Host,Row} from '../../host/types.ts';

/** Website Applets, the YouTube player and Stripe (Mac BrowserDevice, YouTube*, Stripe*). */
export function installBrowser(host:Host){
 const {store}=host;
 const device=new BrowserDevice(host,{
  binary:()=>bundledResource(host.profile,'agentBrowser'),
  python:()=>host.use<AgentService>(AGENT).helperPython(),
  script:agentScript(host.profile.webRoot)
 });
 const youtube=new YouTubeService(host);
 const player=new YouTubePlayer(host,device.surface,()=>websiteSession(store.sampleEnabled()?'practice':'personal',()=>{}));
 const stripe=new StripeService(host);
 const desktop=()=>host.optional<DesktopCompanionService>(DESKTOP_COMPANION);
 // Fox leaving the World window for the desktop stops every page, as the Mac host does, except Fox's
 // own task page: it shows beside the Companion and Fox keeps working (#1175).
 let detachHooked=false;
 const hookDetach=()=>{
  if(detachHooked)return;
  const companion=desktop();if(!companion)return;
  detachHooked=true;companion.beforeDetach(()=>{device.detach();player.stop();});
  companion.onPresentation(away=>{if(away)device.placeTask(companion.panelBounds());else device.attach();});
 };
 device.restoreWorld=()=>desktop()?.restoreWorld();
 host.onPageLoaded(hookDetach);
 const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
 host.register({
  browserShow:request=>{hookDetach();if(!desktop()?.isDesktop)device.show(request);return {ok:true};},
  browserLayout:request=>{device.layout(object(request.rect),request.fox,request.page,request.press===true,request.copy,request.takeCopy===true);return {ok:true};},
  browserHide:request=>{device.hide(request.live);return {ok:true};},
  browserPip:request=>{hookDetach();if(!desktop()?.isDesktop)device.pip(String(request.applet??''),request.rect,request.live);return {ok:true};},
  browserCommand:request=>device.command(typeof request.operation==='string'?request.operation:'',object(request.args),request.agent===true),
  browserBookmarks:()=>discoverBookmarks(),
  browserOutcomeAction:async request=>{
   if(!store.writable||!store.state.cloudConsent||store.sampleEnabled()||typeof request.id!=='string'||typeof request.done!=='boolean')throw new WorldletError('Open your personal world to review a browser result.');
   if(request.done){
    const check=await device.command('automate',{operation:'outcome',receiptId:request.id},true);
    if(typeof check.receipt?.inspectedAt!=='string')throw new WorldletError('Open the result page and check it again before confirming completion.');
   }
   return store.resolveBrowserOutcome(request.id,request.done);
  },
  youtube:request=>youtube.command(request),
  youtubePlayer:async request=>{
   if(request.agent===true)youtube.authorizeAgent();
   switch(request.operation){
    case 'show':player.show(request);return {ok:true};
    case 'layout':player.layout(object(request.rect));return {ok:true};
    case 'hide':player.stop();return {ok:true};
    default:return player.command(request);
   }
  },
  stripe:request=>stripe.command(request)
 });
 host.provide<BrowserService>(BROWSER,{
  // A World page link: the World decides between the in-app browser and the system browser.
  openExternalRequest(url){
   const target=parse(url);
   if(!target||target.protocol!=='https:'||target.username||target.password)return;
   host.page.event('worldlet:open-url',{url:target.href});
  },
  visiblePage:()=>device.visiblePage,
  stop:()=>device.stop(),
  endPictureInPicture:()=>device.endPictureInPicture(),
  privateContextWasRead:()=>device.privateContextWasRead,
  inCall:()=>device.inCall,
  resetHistory:()=>device.resetHistory(),
  recorded:(visits,records)=>device.recorded(visits,records),
  reviewGamesNow:()=>device.battles.check()
 });
 host.onPageReload(()=>{player.stop();stripe.cancel();device.endPictureInPicture();});
 host.onQuit(()=>{device.stop();player.stop();stripe.cancel();});
}
