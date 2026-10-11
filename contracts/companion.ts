/** Host-neutral profile returned by companionProfile. Archive files remain native. */
export interface CompanionProfile {
 name:string;
 createdAt:string;
 personality:string;
 attentionFocus:string;
 /** What the World holds about the companion (shown on the Profile page). */
 knowledge?:CompanionKnowledge;
}
/** Saved memory by kind (`soul` persona, `user` about the person, `longTerm`), how many turns Fox's
 * own conversation holds, and what each other Agent brought. */
export interface CompanionKnowledge {
 memories:{kind:string;text:string;source:string}[];
 conversations:number;
 brought:{source:string;title:string;conversations:number;notes:number;skills:string[];routines:{name:string;schedule:string}[]}[];
}
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):0;
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
function readKnowledge(value:unknown):CompanionKnowledge|undefined {
 if(!isRecord(value))return undefined;
 const memories=(Array.isArray(value.memories)?value.memories:[]).filter(isRecord).filter(m=>typeof m.text==='string').map(m=>({kind:String(m.kind??''),text:m.text as string,source:typeof m.source==='string'?m.source:''}));
 const brought=(Array.isArray(value.brought)?value.brought:[]).filter(isRecord).filter(b=>typeof b.source==='string').map(b=>({source:b.source as string,title:typeof b.title==='string'?b.title:b.source as string,
  conversations:count(b.conversations),notes:count(b.notes),skills:strings(b.skills),
  routines:(Array.isArray(b.routines)?b.routines:[]).filter(isRecord).filter(r=>typeof r.name==='string').map(r=>({name:r.name as string,schedule:typeof r.schedule==='string'?r.schedule:''}))}));
 return {memories,conversations:count(value.conversations),brought};
}
export function readCompanionProfile(value:unknown):CompanionProfile {
 if(!value||typeof value!=='object')throw Error('Invalid companion profile response.');
 const profile=value as Record<string,unknown>;
 if(typeof profile.name!=='string')throw Error('Missing companion profile field: name');
 for(const key of ['createdAt','personality','attentionFocus']){
  if(profile[key]!==undefined&&typeof profile[key]!=='string')throw Error('Missing companion profile field: '+key);
 }
 const knowledge=readKnowledge(profile.knowledge);
 return {name:profile.name as string,createdAt:(profile.createdAt as string|undefined)??'',personality:(profile.personality as string|undefined)??'',attentionFocus:(profile.attentionFocus as string|undefined)??'auto',...(profile.look===undefined?{}:{look:profile.look}),...(knowledge?{knowledge}:{})};
}

export interface CompanionMemory {id:string;kind:string;text:string;source:string}
export interface CompanionTurn {id:string;session:string;role:string;text:string;createdAt:string}
export interface CompanionArchive {
 format:string;version:number;
 identity:{id:string;name:string;createdAt:string};
 personality:string;memoryAuthority:string;
 memories:CompanionMemory[];conversations:CompanionTurn[];
}
export interface CompanionRecallResult {
 records:({text:string;[key:string]:unknown})[];
 referenceOnly:true;
 total?:number;
 memoryAuthority?:string;
 nextOffset?:number;
}
