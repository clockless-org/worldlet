// Meetings: the calendar's calls, opened beside their brief, their live transcripts (the bar over the call and the
// saved ones on the sheet) and the offer when one is due. Mounted by the Frame's World page (ui/frame/notion-world.ts),
// which passes what it owns as a host; values it replaces later (the World, where the person is, the scene, the
// companion's voice, the HUD) are read through getters, at the moment they are needed.
import type {World} from '../../contracts/world.ts';
import {MEETING_BRIEF_REQUEST,meetingSummaryRequest,calendarMeetings,dueMeeting,meetingsStage,connectionLive} from '../../context/applets/index.ts';
import {node,textButton} from '../style/index.ts';
import {renderTranscript,transcriptBar} from './meetings/transcript.ts';

const element:(tag:string,cls?:string,text?:unknown)=>any=node;
const button=textButton;

export type MeetingsHostOptions={
 data:()=>World;
 native:any;
 root:any;
 content:any;
 hud:any;
 current:()=>string|null;
 scene:()=>any;
 voice:()=>any;
 nativeHUD:()=>any;
 sections:any[];
 browserPanel:any;
 header:(title:string,place:string,options?:any)=>void;
 sceneState:()=>void;
 dismissFox:()=>void;
 visitObject:(id:string,options?:any)=>void;
 appletStageData:(r:any,records:any[])=>any;
 sampleStageRecords:(r:any)=>any[];
 setLibraryWebReturn:(value:any)=>void;
 clearAppReader:()=>void;
};

export function createMeetings(host:MeetingsHostOptions){
 const {native,root,content,hud,sections,browserPanel,header,sceneState,dismissFox,visitObject,appletStageData,sampleStageRecords,setLibraryWebReturn,clearAppReader}=host;
 const data=host.data,current=host.current,scene=host.scene,voice=host.voice,nativeHUD=host.nativeHUD;
 let meetingRecords=[],meetingLoading=false,meetingReadAt=0,meetingAttemptAt=0;
 const meetingSeenKey='worldlet-meetings-seen-'+(data().workspaceId||data().workspace);
 const meetingSeen=new Set<string>();try{for(const id of JSON.parse(localStorage.getItem(meetingSeenKey)||'[]'))meetingSeen.add(id);}catch{}
 // The calendar call on screen (null for a new call or a pasted link): Fox's context and brief.
 let openedMeeting=null;const briefedMeetings=new Map<string,number>();
 function openMeeting(r,url,title,meeting=null){
   setLibraryWebReturn({app:r,record:null});clearAppReader();openedMeeting=meeting;transcriptDeclined=false;
   header(title||r.title,'Meetings',{applet:true});browserPanel.mount('meetings',{url,platform:'web'});sceneState();
   dismissFox();syncTranscriptBar();
   // Opening a calendar call is the request for its brief: Fox says who and what, with what the
   // World knows, while the meeting's waiting page loads. Once per call within half an hour.
   if(meeting&&!data().sample&&Date.now()-(briefedMeetings.get(meeting.id)||0)>1800000){briefedMeetings.set(meeting.id,Date.now());void voice()?.ask?.(MEETING_BRIEF_REQUEST,{displayText:'Meeting brief',icon:'spark'});}
 }
 function meetingsStageValue(error=''){return {...meetingsStage(meetingRecords,error),transcripts:meetingTranscripts,openTranscript,openLink:(url,provider)=>{const r=sections.find(s=>s.key==='meetings');if(r)openMeeting(r,url,provider);}};}
 // Live transcripts of calls (Meetings): the host's state, the bar over the call while it runs, and the
 // saved transcripts listed on the sheet. A call starts its transcript by itself (owner request
 // 2026-10-06); once the person stops it, or it could not start, it stays off for that call.
 let meetingTranscripts=[],transcriptState=null,transcriptView=null,transcriptBarTimer=null,transcriptDeclined=false;
 // Every transcribed call gets a summary artifact once its last line is kept (owner request 2026-10-06).
 const summarizedTranscripts=new Set<string>();
 async function loadTranscripts(){
   if(data().sample||!native?.browser)return;
   try{const value=await native.browser.command('transcripts',{},false);if(!Array.isArray(value?.transcripts))return;meetingTranscripts=value.transcripts;
     if(current()==='app-meetings'&&content.hidden)scene()?.setAppStage?.(current(),meetingsStageValue());}catch{}
 }
 async function openTranscript(session,meeting){
   const r=sections.find(s=>s.key==='meetings');if(!r||!native?.browser)return;
   let lines=[];try{const value=await native.browser.command('transcript',{session},false);lines=Array.isArray(value?.lines)?value.lines:[];}catch{}
   if(current()!==r.moduleId)return;
   header(meeting||'Transcript','Meetings',{applet:true});content.dataset.applet='meetings';content.dataset.template='meeting-transcript';
   renderTranscript(content,{meeting,lines});sceneState();
 }
 function meetingCallOpen(){return current()==='app-meetings'&&!content.hidden&&content.dataset.template==='browser';}
 function syncTranscriptBar(){
   const state=transcriptState,show=!!state&&(state.active||state.waiting>0||Date.now()-(state.endedAt||0)<4000)&&meetingCallOpen();
   if(!show){transcriptView?.element.remove();return;}
   transcriptView??=transcriptBar(()=>void setTranscribing(false));
   transcriptView.update(state);
   const viewport=content.querySelector('.browser-viewport');
   if(viewport&&transcriptView.element.nextElementSibling!==viewport)content.insertBefore(transcriptView.element,viewport);
 }
 async function setTranscribing(on){
   const title=openedMeeting?.title||browserPanel.lastVisit('meetings')?.title||'Meeting';
   if(!on)transcriptDeclined=true;
   let error='';
   try{const value=await native?.browser?.command('transcribe',{on,meeting:title},false);if(value?.error)error=String(value.error);}
   catch(e){error=e?.message||'Could not start the transcript.';}
   if(error){transcriptDeclined=true;voice()?.setGuide?.({source:'meeting-transcript',text:error});voice()?.revealGuide?.();}
   nativeHUD()?.sync();
 }
 window.addEventListener('worldlet:browser',(event:any)=>{
   const value=event.detail;
   if(value?.phase==='meeting-ready'){if(!data().sample&&!transcriptDeclined&&!transcriptState?.active&&meetingCallOpen())void setTranscribing(true);return;}
   if(value?.phase!=='transcript')return;
   const ended=transcriptState?.active&&!value.active;
   transcriptState={...value,endedAt:value.active?0:(transcriptState?.endedAt||Date.now())};
   syncTranscriptBar();nativeHUD()?.sync();
   if(ended||!value.active&&!value.waiting){clearTimeout(transcriptBarTimer);transcriptBarTimer=setTimeout(()=>{syncTranscriptBar();void loadTranscripts();},4500);}
   if(!value.active&&!value.waiting&&value.lines>0&&typeof value.visit==='string'&&value.visit&&!data().sample&&!summarizedTranscripts.has(value.session)){
     summarizedTranscripts.add(value.session);
     void voice()?.ask?.(meetingSummaryRequest({meeting:value.meeting,visit:value.visit}),{displayText:'Meeting summary',icon:'spark'});
   }
 });
 function showMeetings(r){
   content.hidden=true;hud.classList.remove('is-reading');clearAppReader();openedMeeting=null;void loadTranscripts();
   // The sample world shows its authored meeting notes where calendar calls would be.
   const stage=meetingsStageValue();if(data().sample)stage.items=[...appletStageData(r,sampleStageRecords(r)).items,...stage.items];
   scene()?.setAppStage?.(r.moduleId,stage);sceneState();
   void refreshMeetings();
 }
 async function refreshMeetings(){
   if(meetingLoading||data().sample||!native?.appContent)return;
   const connected=connectionLive(data().moduleConnections?.find(c=>c.provider==='google-calendar')||{});
   if(!connected){meetingRecords=[];if(current()==='app-meetings')scene()?.setAppStage?.(current(),{...meetingsStageValue(),connected:false});return;}
   meetingLoading=true;meetingAttemptAt=Date.now();
   try{const value=await native.appContent({provider:'google-calendar',refresh:true});meetingRecords=calendarMeetings(value?.pages||[]);meetingReadAt=Date.now();
     if(current()==='app-meetings'&&content.hidden)scene()?.setAppStage?.(current(),meetingsStageValue());
   }catch{meetingReadAt=0;if(current()==='app-meetings'&&content.hidden)scene()?.setAppStage?.(current(),meetingsStageValue('Calendar could not refresh. Ask Fox to retry.'));}
   finally{meetingLoading=false;}
 }
 const meetingPoll=setInterval(()=>{
   if(!root.isConnected||data().sample)return;
   // No stale/offline prompts, no replacement of a meeting already on screen.
   // A hidden page offers nothing, so it does not read Calendar every minute either;
   // the first tick after it is shown again refreshes.
   if(!document.hidden&&Date.now()-meetingAttemptAt>60000&&!meetingLoading)void refreshMeetings();
   if(document.hidden||root.dataset.onboarding==='true'||Date.now()-meetingReadAt>90000||current()==='app-meetings'&&!content.hidden)return;
   const due=dueMeeting(meetingRecords,meetingSeen),r=sections.find(s=>s.key==='meetings');if(!due||!r)return;
   meetingSeen.add(due.id);try{localStorage.setItem(meetingSeenKey,JSON.stringify([...meetingSeen].slice(-200)));}catch{}
   offerMeeting(r,due);
 },5000);
 // Any invite can put a valid meeting link on the calendar, so a due meeting is only
 // offered: Fox shows it with an explicit Join action and nothing opens by itself.
 function offerMeeting(r,due){
   const source='meeting-due',close=()=>voice()?.setGuide?.(null,{only:source,forget:true});
   const body=element('p','',due.title+' · '+due.provider);
   voice()?.setGuide?.({source,text:'A meeting is starting.',body,actions:[
     button('Join',()=>{close();visitObject(r.moduleId,{enter:false});openMeeting(r,due.url,due.title,due);}),
     button('Not now',close)]});
   voice()?.revealGuide?.();
 }
 return {
  show:showMeetings,open:openMeeting,setTranscribing,
  /** The calendar call on screen, or null for a new call or a pasted link. */
  opened:()=>openedMeeting,
  /** The host's transcript state for the call, or null. */
  transcript:()=>transcriptState,
  dispose:()=>clearInterval(meetingPoll),
 };
}
