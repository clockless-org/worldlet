import type {AppletActivity} from '../../contracts/applet-activity.ts';
import type {WorldItem} from '../../contracts/world-item.ts';
import {characters} from '../companion/index.ts';
// Turns that read this app successfully and have not finished. A background analysis turn takes
// over the activity while Fox's chat turn is still open; the chat turn may still describe what it read.
const readTurns=(activity:AppletActivity|undefined)=>(activity?.readTurns??[]).slice(-8);
export function receiveAppletActivity(previous:AppletActivity|undefined,event:WorldItem,turn:string):AppletActivity|null {
 if(typeof event.callId!=='string'||typeof event.phase!=='string')return null;
 const callId=event.callId;
 const activity:AppletActivity=previous?.turn===turn?{...previous,calls:[...previous.calls],readTurns:readTurns(previous)}:{turn,calls:[],succeeded:false,failed:false,summary:'',needsAttention:false,readTurns:readTurns(previous)};
 const index=activity.calls.findIndex(id=>id.normalize('NFC')===callId.normalize('NFC'));
 if(event.phase==='reading'){if(index<0)activity.calls.push(event.callId);}
 else{
  if(index<0)return null;
  activity.calls.splice(index,1);
  if(event.phase==='complete'){activity.succeeded=true;if(!activity.readTurns!.includes(turn))activity.readTurns=[...activity.readTurns!,turn].slice(-8);}else if(event.phase!=='yielded')activity.failed=true;
  if(typeof event.count==='number'&&Number.isInteger(event.count)&&event.count>=0&&event.count<=100000)activity.count=event.count;
 }
 return activity;
}
export function describeAppletActivity(activity:AppletActivity|undefined,body:WorldItem,turn:string):AppletActivity {
 if(!activity||!(activity.turn===turn&&activity.succeeded||readTurns(activity).includes(turn))||typeof body.summary!=='string'||characters(body.summary).length>160||typeof body.needsAttention!=='boolean')throw Error('Read this app successfully before describing its state.');
 return {...activity,calls:[...activity.calls],summary:body.summary,needsAttention:body.needsAttention};
}
export function finishAppletActivity(activity:AppletActivity,turn:string,cancelled:boolean):AppletActivity {
 const read=readTurns(activity),open=read.filter(id=>id!==turn);
 const finished=open.length===read.length?activity:{...activity,readTurns:open};
 return finished.turn===turn&&finished.calls.length?{...finished,calls:[],failed:!cancelled}:finished;
}
export function appletActivitySnapshot(provider:string,connected:boolean,syncStatus:string|undefined,items:WorldItem[],check:WorldItem|undefined,activity:AppletActivity|undefined,now=Date.now(),attentionPending=false):WorldItem {
 // A snoozed item stays quiet until its time, by the same rule as refreshItemPage.
 const open=items.filter(i=>i.provider===provider&&(i.status==='open'||i.status==='read'&&i.kind!=='update')&&!(Date.parse(i.snoozedUntil as string)>now));
 const calls=!!activity?.calls.length;
 return {connected,reading:connected&&(calls||syncStatus==='reading'),running:connected&&(calls||check?.lastStatus==='running'),
  // What was read still waits for the Attention Center to turn it into items.
  synthesizing:connected&&attentionPending,
  failed:connected&&(syncStatus==='sync_error'||activity?.failed===true||check?.lastStatus==='error'),needsAttention:!!open.length||activity?.needsAttention===true,savedItemCount:open.length,
  ...(activity?.summary?{summary:activity.summary}:{}),...(activity?.count!==undefined?{resultCount:activity.count}:{})};
}
