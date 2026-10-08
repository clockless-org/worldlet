import {core} from '../../core.ts';
import {WorldletError} from '../../files.ts';
import {canBuild} from '../../store/world-store.ts';
import {SOURCES,SPEECH} from '../../host/services.ts';
import {SourcesContext} from './context.ts';
import {APPLE_PROVIDERS,readApple} from './apple.ts';
import {appContent,curatedSourceContent,doorDash,itemOriginal,notionContent,paypalContent} from './content.ts';
import {presentMailRead} from './records.ts';
import {createConnections} from './connections.ts';
import {createReviews} from './reviews.ts';
import {createOrganizer} from './organize.ts';
import {createOnboarding} from './onboarding.ts';
import {createLocal} from './local.ts';
import {createMessages} from './messages.ts';
import {mailAvatar,clearMailAvatars} from './mail-avatar.ts';
import {attentionImage,clearAttentionImages} from './attention-image.ts';
import type {SourcesService,SpeechService} from '../../host/services.ts';
import type {AppletActivity} from '../../store/world-store.ts';
import type {Host,Row} from '../../host/types.ts';
// Sources and connections: account connections, live Applet content, local files, reviewed
// external writes, setup and local deletion. Shared Core owns every product rule used here.
const text=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;

export function installSources(host:Host){
 const ctx=new SourcesContext(host);
 const {store}=ctx;
 const reviews=createReviews(ctx);
 const connections=createConnections(ctx);
 const organizer=createOrganizer(ctx);
 const onboarding=createOnboarding(ctx);
 const local=createLocal(ctx,()=>reviews.clearMail());
 const messages=createMessages(ctx);

 // Applet activity: a projection of Agent events, not another source or memory database.
 const touched=()=>{store.activityRevision+=1;store.notify();};
 function receiveAppletEvent(event:Row,turn:string){
  const provider=event?.provider;
  if(typeof provider!=='string'||!store.state.connections.some((c:Row)=>c.provider===provider&&canBuild(c)))return;
  try{
   const activity=core<AppletActivity|null>('appletActivityReceive',{event,turn,activity:store.appletActivity[provider]??null});
   if(!activity)return;
   store.appletActivity[provider]=activity;touched();
  }catch(error){host.diagnostics.record(error,'appletActivity',turn);}
 }
 function describeApplet(body:Row,turn:string):Row {
  const provider=body?.provider;
  if(typeof provider!=='string')throw new WorldletError('Read this app successfully before describing its state.');
  const activity=core<AppletActivity|null>('appletActivityDescribe',{body,turn,activity:store.appletActivity[provider]??null});
  if(!activity)throw new WorldletError('Invalid Applet activity.');
  store.appletActivity[provider]=activity;touched();
  return {ok:true,ephemeral:true};
 }
 function finishAppletTurn(turn:string,cancelled=false){
  try{
   for(const [provider,activity] of Object.entries(store.appletActivity)){
    if(activity.turn!==turn&&!activity.readTurns?.includes(turn))continue;
    const next=core<AppletActivity|null>('appletActivityFinish',{turn,cancelled,activity});
    if(next)store.appletActivity[provider]=next;else delete store.appletActivity[provider];
   }
  }catch(error){host.diagnostics.record(error,'appletActivity',turn);}
  touched();
 }

 const organizeSources=(body:Row)=>{host.optional<SpeechService>(SPEECH)?.cancelCapture();return organizer.organizeSources(body);};
 const service:SourcesService={
  itemOriginal:id=>itemOriginal(ctx,id),
  receiveAppletEvent,describeApplet,finishAppletTurn,
  clearMailReviews:()=>reviews.clearMail(),
  cancel(){ctx.cancel();reviews.cancel();organizer.cancel();},
  serviceReply:(name,args,_turn,_home,options)=>reviews.serviceReply(name,args,options),
  readNative:(provider,options)=>readApple(ctx,provider,false,options?.includeCancelled===true),
  presentMailRead:(records,accumulate)=>presentMailRead(ctx.store,records,accumulate),
  importFiles:body=>connections.importFiles(body),
  organizeSources
 };
 host.provide(SOURCES,service);
 // The host capability owner for Calendar, Notes and Reminders (main.ts `implemented`).
 host.provide('appleSources',{providers:APPLE_PROVIDERS,read:(provider:string,authorize:boolean,includeCancelled=false)=>readApple(ctx,provider,authorize,includeCancelled)});

 host.register({
  connect:body=>connections.connect(body),
  connectCancel:()=>{connections.connectCancel();return {ok:true};},
  agentIntegrations:body=>connections.agentIntegrations(body),
  disconnectSource:async body=>{await connections.disconnectSource(body);return {ok:true};},
  appContent:body=>appContent(ctx,text(body.provider),body.refresh===true),
  notionContent:body=>notionContent(ctx,text(body.operation,'list'),text(body.id)),
  notionReview:body=>reviews.notionReview(body),
  obsidianContent:body=>local.obsidianContent(body),
  paypalContent:body=>paypalContent(ctx,body),
  curatedSourceContent:body=>curatedSourceContent(ctx,body),
  doorDash:body=>doorDash(ctx,text(body.operation,'status')),
  homeReview:body=>reviews.homeReview(body),
  emailAction:body=>reviews.emailAction(body),
  importFiles:body=>connections.importFiles(body),
  folderConnection:body=>connections.folderConnection(body),
  organizeSources,
  onboarding:body=>onboarding.onboarding(body),
  installedApplets:body=>local.installedApplets(body),
  openInstalledApplet:body=>local.openInstalledApplet(body),
  copyAppletPrototype:body=>local.copyAppletPrototype(body),
  deleteSourceData:body=>local.deleteSourceData(body),
  deleteWorldItem:body=>local.deleteWorldItem(body),
  clearWorldContent:()=>{clearMailAvatars();clearAttentionImages();return local.clearWorldContent();},
  mailAvatar:body=>mailAvatar(body,store.sampleEnabled()),
  attentionImage:body=>attentionImage(body,store.sampleEnabled()),
  messages:body=>messages.handle(body)
 });
 // After Restart Worldlet for Full Disk Access, open Messages again; its list retries with the new permission.
 host.onPageLoaded(()=>{if(messages.retryAfterRestart())void host.worldView()?.webContents.executeJavaScript("location.hash='object=app-messages'").catch(()=>{});});
 host.onQuit(()=>service.cancel());
}
