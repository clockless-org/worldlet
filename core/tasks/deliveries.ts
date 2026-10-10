/** Durable, independently acknowledged subscriptions to committed Applet context. */
export interface DeliveryFact {id:string;provider:string;revision:string|number;expiresAt:number}
export interface DeliverySubscription {consumerId:string;providers:string[];enabled:boolean}
export interface Delivery {id:string;consumerId:string;entityId:string;revision:string|number;provider:string;status:'pending'|'acknowledged'|'quarantined';createdAt:number;acknowledgedAt?:number;isolate?:boolean;attempts?:number;errorCode?:string}
/** Trusted host registration, not a grant of access to provider data. */
export const attentionSubscription:DeliverySubscription={consumerId:'attention:center',providers:['*'],enabled:true};
export function validateDeliverySubscriptions(rows:DeliverySubscription[]):DeliverySubscription[]{
 if(!Array.isArray(rows)||rows.length>32)throw Error('Invalid subscription registry');
 const ids=new Set<string>();
 for(const row of rows){
  if(!row||typeof row.consumerId!=='string'||!/^[a-z0-9:_-]{1,120}$/.test(row.consumerId)||ids.has(row.consumerId)||typeof row.enabled!=='boolean'||!Array.isArray(row.providers)||row.providers.length===0||row.providers.length>100||row.providers.some(p=>typeof p!=='string'||!/^([a-z0-9-]{1,100}|\*)$/.test(p)))throw Error('Invalid delivery subscription');
  ids.add(row.consumerId);
 }
 return rows;
}
const key=(consumer:string,entity:string)=>JSON.stringify([consumer,entity]);
export function reconcileDeliveries(rows:Delivery[],facts:DeliveryFact[],seen:Record<string,string|number>,now:number,subscriptions:DeliverySubscription[]=[attentionSubscription]):Delivery[]{
 validateDeliverySubscriptions(subscriptions);
 const old=new Map(rows.map(r=>[key(r.consumerId,r.entityId),r]));
 const current=new Map(facts.filter(f=>f.expiresAt>now).map(f=>[f.id,f]));
 return subscriptions.filter(s=>s.enabled).flatMap(s=>Array.from(current.values()).filter(f=>s.providers.includes('*')||s.providers.includes(f.provider)).map(f=>{
  const previous=old.get(key(s.consumerId,f.id));
  if(previous?.revision===f.revision&&previous.provider===f.provider)return previous;
  // Preserve deployed Center row IDs and its legacy migration receipts only.
  return {id:s.consumerId==='attention:center'?'attention:center:'+f.id:'delivery:'+key(s.consumerId,f.id),consumerId:s.consumerId,entityId:f.id,revision:f.revision,provider:f.provider,status:s.consumerId==='attention:center'&&seen[f.id]===f.revision?'acknowledged' as const:'pending' as const,createdAt:now};
 }));
}
export function acknowledgeDeliveries(rows:Delivery[],seeds:{id:string;revision:string|number}[],now:number,consumerId='attention:center'):Delivery[]{
 const versions=new Map(seeds.map(s=>[s.id,s.revision]));
 return rows.map(row=>row.consumerId===consumerId&&row.status==='pending'&&versions.get(row.entityId)===row.revision?{...row,status:'acknowledged',acknowledgedAt:now}:row);
}

/** A normally completed turn with no acknowledged input can be isolated for repair.
 * Provider/network/quota errors never count as poisoned content. */
export function failDeliveries(rows:Delivery[],seeds:{id:string;revision:string|number}[],consumerId:string,code:string,isolated:boolean):Delivery[]{
 if(!['unverified_output','incomplete_coverage'].includes(code))return rows;
 const versions=new Map(seeds.map(s=>[s.id,s.revision]));
 return rows.map(row=>{
  if(row.consumerId!==consumerId||row.status!=='pending'||versions.get(row.entityId)!==row.revision)return row;
  const attempts=(row.attempts||0)+(isolated&&seeds.length===1?1:0);
  return {...row,isolate:true,attempts,errorCode:code,status:attempts>=3?'quarantined':'pending'};
 });
}
export function retryQuarantinedDeliveries(rows:Delivery[],consumerId:string):Delivery[]{
 return rows.map(row=>row.consumerId===consumerId&&row.status==='quarantined'?{...row,status:'pending',attempts:0,isolate:true,errorCode:undefined}:row);
}

/** Saving one finding is not acknowledgement of the entire supplied batch.
 * Withheld inputs (cited by a rejected finding) stay pending while accepted siblings commit. */
export function attentionCoverage(input:{available:string[];required:string[];previous:string[];processed:string[];withheld?:string[]}){
 const available=new Set(input.available),withheld=new Set(Array.isArray(input.withheld)?input.withheld:[]);
 if(!Array.isArray(input.processed)||input.processed.length>1000||input.processed.some(id=>typeof id!=='string'||!available.has(id)))throw Error('Only supplied context IDs can be acknowledged');
 const processed=[...new Set([...input.previous,...input.processed.filter(id=>!withheld.has(id))])].filter(id=>available.has(id));
 const covered=new Set(processed),remaining=input.required.filter(id=>!covered.has(id));
 return {processed,remaining,complete:remaining.length===0};
}

/** Context IDs cited by rejected findings. Their inputs stay pending for a later, smaller retry. */
export function withheldContextIds(input:{context:{id?:unknown;provider?:unknown;sourceId?:unknown}[];rejected:{sources?:unknown}[]}):string[]{
 const cited=new Set((Array.isArray(input.rejected)?input.rejected:[]).flatMap(item=>Array.isArray(item?.sources)?item.sources:[]).map((ref:any)=>JSON.stringify([ref?.provider,ref?.id])));
 return (Array.isArray(input.context)?input.context:[]).filter(row=>typeof row?.id==='string'&&cited.has(JSON.stringify([row.provider,row.sourceId??row.id]))).map(row=>row.id as string);
}
