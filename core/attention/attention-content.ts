import {validAttentionTime} from './attention-time.ts';
import {attentionEventError} from '../items/index.ts';
import type {WorldItem} from '../../contracts/world-item.ts';
/** Card copy limits in Unicode code points. The upsert_world_items schema mirrors them so models see the same limits. */
export const ATTENTION_CONTENT_LIMITS={title:40,reason:56,reasonWords:8,summary:1200,actionLabel:32,locationName:80,location:240} as const;
/** Reason words as Core counts them: runs of JavaScript whitespace split the trimmed reason. harness/hermes/source_batch.py mirrors this for its in-batch repair; scripts/source-batch-check.py compares them. */
export const attentionReasonWords=(reason:string)=>reason.trim().split(/\s+/u).length;
/** The model writes the public brief. Original titles and quotes stay in source evidence. */
export function processedAttentionContent(item:WorldItem):WorldItem {
 const L=ATTENTION_CONTENT_LIMITS;
 const bounded=(key:string,max:number,required=true,multiline=false)=>{
  const raw=item[key];
  if(!required&&raw===undefined)return undefined;
  // Surrounding whitespace is not copy: measure and store the trimmed value.
  const value=typeof raw==='string'?raw.trim():raw;
  if(typeof value!=='string'||!value||[...value].length>max||(!multiline&&/[\r\n]/.test(value)))throw Error(`Attention ${key} must be a concise model-written value (${max} characters maximum).`);
  return value;
 };
 if(item.kind==='event'&&item.provider!=='google-calendar'&&!['confirmed','important','optional'].includes(String(item.eventDisposition)))throw Error('Non-Calendar events need eventDisposition: confirmed with evidence; uncommitted invitations belong in Worth Knowing.');
 const title=bounded('title',L.title),reason=bounded('reason',L.reason),summary=bounded('summary',L.summary,true,true);
 if(attentionReasonWords(reason!)>L.reasonWords)throw Error(`Attention reason must be at most ${L.reasonWords} words: explain why it matters now, without repeating the title, time or location.`);
 for(const key of ['dueAt','occurredAt','sourceUpdatedAt']){const value=item[key];if(value!==undefined&&!validAttentionTime(value))throw Error(`Attention ${key} needs an evidence-backed ISO8601 date, with timezone for a clock time.`);}
 const eventError=attentionEventError(item.event,item.sources);if(eventError)throw Error(eventError);
 const actionLabel=bounded('actionLabel',L.actionLabel,false);
 const locationName=bounded('locationName',L.locationName,false),location=bounded('location',L.location,false);
 if(location&&!locationName)throw Error('Attention location needs a short locationName for the card.');
 // context remains a storage compatibility alias, never a second generated version.
 return {...item,title,reason,summary,context:reason,...(item.kind==='task'?{attentionReason:item.attentionReason||reason}:{}),...(actionLabel?{actionLabel}:{}),...(locationName?{locationName}:{}),...(location?{location}:{}),attentionContentVersion:1};
}

/** Scheduled readers and trusted observation snapshots are both valid owners. */
export function attentionOwnerAllowed(provider:unknown,sources:any[],scheduled:string[],facts:any[]=[],monitorProvider?:string):boolean {
 return typeof provider==='string'&&(!monitorProvider||provider===monitorProvider)
  &&(scheduled.includes(provider)||facts.some(f=>f.provider===provider))
  &&Array.isArray(sources)&&sources.some(ref=>ref?.provider===provider);
}
