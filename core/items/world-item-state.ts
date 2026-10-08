import {characters} from '../companion/index.ts';

import type {WorldItem as Item} from '../../contracts/world-item.ts';
/** Pure state changes. Hosts own evidence authorization, identity and transactions. */
export function updateWorldItem(item:Item,status:string,now:string,snoozedUntil?:string,by?:string):Item {
 if(!['open','read','done','dismissed'].includes(status))throw Error('Unknown item or status.');
 if(snoozedUntil!==undefined&&(status!=='open'||!Number.isFinite(Date.parse(snoozedUntil))||Date.parse(snoozedUntil)<=Date.parse(now)))throw Error('Choose a future snooze time.');
 const result:Item={...item,status,statusOrigin:'user',updatedAt:now};
 delete result.snoozedUntil;if(snoozedUntil)result.snoozedUntil=snoozedUntil;
 // Who did the work the person marked done: Fox, when they confirm Fox's result. Any later
 // status the person sets is their own.
 delete result.completedBy;if(status==='done'&&by==='fox')result.completedBy='fox';
 return result;
}
export function reviewWorldItem(item:Item,assessment:string,reason:string,sources:unknown[],now:string):Item {
 if(!['actionable','resolved','uncertain'].includes(assessment)||typeof reason!=='string'||!reason.length||characters(reason).length>600)
  throw Error("A review needs fresh evidence from the item's own source.");
 const current=typeof item.status==='string'?item.status:'candidate';
 const locked=['done','dismissed','read'].includes(current)&&item.statusOrigin!=='agent';
 return {...item,...(locked?{}:{status:assessment==='actionable'?'open':assessment==='resolved'?'done':'candidate',statusOrigin:'agent'}),
  assessment,attentionReason:reason,policyVersion:2,reviewEvidence:sources,reviewedAt:now,updatedAt:now};
}
export function prepareWorldItem(item:Item,previous:Item|undefined,id:string,identity:string,run:string,now:string,previousIdentity?:string):Item {
 const result:Item={...item,identity,id,status:previous?.status==='candidate'?'open':previous?.status??'open',policyVersion:2,
  statusOrigin:previous?.statusOrigin??'agent',createdAt:previous?.createdAt??now,observedAt:previous?previous.observedAt:now,updatedAt:now,runId:run};
 delete result.snoozedUntil;if(previous?.snoozedUntil)result.snoozedUntil=previous.snoozedUntil;
 delete result.obligationIdentityAliases;
 // Receipt time is host-owned: projection reads it from the reader's facts, never from the model.
 delete result.receivedAt;
 if(item.kind==='task'){
  result.obligationIdentityVersion=1;
  // Only host-computed/current persisted identities are trusted, never proposed aliases.
  const saved=previous?.obligationIdentityVersion===1&&Array.isArray(previous.obligationIdentityAliases)?previous.obligationIdentityAliases:[];
  const prior=previousIdentity??(previous?.obligationIdentityVersion===1?previous.identity:undefined);
  result.obligationIdentityAliases=[...new Set([...saved,prior,identity].filter(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))];
 }else delete result.obligationIdentityVersion;
 delete result.key;
 delete result.legacySourceId;
 if(previous?.legacySourceId!==undefined)result.legacySourceId=previous.legacySourceId;
 return result;
}
export function needsAttentionReview(item:Item):boolean {
 return item.policyVersion!==2&&['open','read'].includes(String(item.status??''));
}

/** Idempotent local mutation; hosts apply it inside their ledger transaction. */
export function worldItemMutation(item:Item,status:string,now:string,snoozedUntil?:string,readOnlyUpdate=false,by?:string) {
 const next=updateWorldItem(item,status,now,snoozedUntil,by);
 if(readOnlyUpdate&&(item.kind!=='update'||item.status!=='open'))return {changed:false,item};
 if(item.status===status&&item.statusOrigin==='user'&&item.snoozedUntil===snoozedUntil&&item.completedBy===next.completedBy)return {changed:false,item};
 return {changed:true,item:next};
}
