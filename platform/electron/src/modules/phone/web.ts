import {WebRecorder,type RecordSink} from '../browser/recorder.ts';
import type {PhoneMessage} from '../../../../../core/phone/index.ts';

const WEEK=7*86400;

/** What happened on websites the paired phone opened in its own browser (owner request 2026-10-07), kept in the
 * World like the computer's own browsing (core/browser/web-record.ts decides what is kept, here again after the
 * phone's own observer): one recorder per Applet, its visits marked `phone:<Applet>`, each record at the phone's time
 * (within the past week, never ahead of now). Pages the phone shows have no network records. */
export function phoneWebRecording(sink:RecordSink,{now=()=>Date.now()/1000,onError}:{now?:()=>number;onError?:(error:unknown)=>void}={}){
 const recorders=new Map<string,{recorder:WebRecorder;page:{url:string;title:string;cdp:()=>Promise<never>};at:number}>();
 return {
  record(message:Extract<PhoneMessage,{type:'web'}>){
   let entry=recorders.get(message.applet);
   if(!entry){
    const page={url:'',title:'',cdp:()=>Promise.reject(new Error('A phone page has no DevTools.'))};
    const made:{recorder:WebRecorder;page:typeof page;at:number}={page,at:now(),recorder:null as unknown as WebRecorder};
    made.recorder=new WebRecorder(page,sink,{applet:'phone:'+message.applet,now:()=>made.at,onError});
    recorders.set(message.applet,entry=made);
   }
   const latest=now();
   for(const record of [...message.records].sort((a,b)=>a.at-b.at)){
    entry.at=Math.min(latest,Math.max(latest-WEEK,record.at));
    entry.page.url=record.url;if(record.title)entry.page.title=record.title;
    entry.recorder.observed(record);
   }
   entry.recorder.flush();
  },
 };
}
