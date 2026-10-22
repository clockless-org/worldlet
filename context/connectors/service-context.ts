// The World's saved Service context (context/applets/INTEGRATIONS.md#searching-saved-service-context): one search, and one
// read, across what the World keeps up to date from each connected Service (service-sync snapshots), for an Agent that
// may read that Service. Pure: the host supplies the snapshots and which Services the calling Agent may read; nothing
// here asks a Service anything.
import type {ServiceSyncSnapshot} from '../../contracts/service-sync.ts';
import {SERVICE_PROVIDERS,SERVICE_TITLES} from '../../contracts/services.ts';

export const SERVICE_CONTEXT_LIMITS=Object.freeze({query:200,results:20,snippet:240,text:20_000});
export const SERVICE_CONTEXT_REASONS=Object.freeze({
 query:'Search with a few words (at most 200 characters).',
 provider:'Choose a Service you may read: github, posthog, cloudflare or search-console.',
 id:'Read a result by the id context/search returned, such as github:example/app#12.',
 missing:'That is not in the World\'s saved context, or this Agent may not read its Service. Search again with context/search.',
 operation:'Choose search or read.',
});
type Found={provider:string;snapshot:ServiceSyncSnapshot;record:ServiceSyncSnapshot['records'][number]};
const fail=(reason:string):never=>{throw new Error(reason);};
const lower=(value:unknown)=>String(value??'').toLowerCase();
/** Every saved record the Agent may read, newest snapshot first, once per Service and record. */
function readable(snapshots:readonly ServiceSyncSnapshot[],canRead:(provider:string)=>boolean):Found[] {
 const seen=new Set<string>(),out:Found[]=[];
 for(const snapshot of [...snapshots].sort((a,b)=>b.collectedAt-a.collectedAt)){
  if(!SERVICE_PROVIDERS.includes(snapshot.provider)||!canRead(snapshot.provider))continue;
  for(const record of snapshot.records){
   const key=snapshot.provider+':'+record.id;
   if(seen.has(key))continue;
   seen.add(key);out.push({provider:snapshot.provider,snapshot,record});
  }
 }
 return out;
}
const words=(record:Found['record'])=>[record.title,record.id,record.text??'',...Object.entries(record.fields).map(([k,v])=>k+' '+v),...(record.comments??[]).map(c=>c.author+' '+c.text)];
function snippet(record:Found['record'],terms:string[]):string {
 const body=[record.text??'',...Object.entries(record.fields).map(([k,v])=>`${k}: ${v}`)].join(' · ').replace(/\s+/g,' ').trim();
 const at=terms.reduce((best,term)=>{const i=lower(body).indexOf(term);return i>=0&&(best<0||i<best)?i:best;},-1);
 const start=Math.max(0,at-60);
 return (start?'…':'')+[...body.slice(start)].slice(0,SERVICE_CONTEXT_LIMITS.snippet).join('')+(body.length-start>SERVICE_CONTEXT_LIMITS.snippet?'…':'');
}
/** `context/search` (`query`, optionally `provider`) or `context/read` (`id` as search returned it: `<provider>:<record
 * id>`), over `snapshots`, limited to Services `canRead` allows. Every answer is marked untrusted: it is what the
 * Services returned. */
export function serviceContext(snapshots:readonly ServiceSyncSnapshot[],request:Record<string,unknown>,canRead:(provider:string)=>boolean):Record<string,unknown> {
 const operation=request.operation;
 if(operation==='search'){
  const query=typeof request.query==='string'?request.query.trim():'';
  if(!query||query.length>SERVICE_CONTEXT_LIMITS.query)fail(SERVICE_CONTEXT_REASONS.query);
  const only=request.provider===undefined||request.provider===''?null:String(request.provider);
  if(only!==null&&(!SERVICE_PROVIDERS.includes(only)||!canRead(only)))fail(SERVICE_CONTEXT_REASONS.provider);
  const terms=[...new Set(lower(query).split(/\s+/).filter(Boolean))].slice(0,12);
  const scored=readable(snapshots,canRead).filter(item=>only===null||item.provider===only).flatMap(item=>{
   const title=lower(item.record.title),all=lower(words(item.record).join(' '));
   if(!terms.every(term=>all.includes(term)))return [];
   const score=terms.reduce((sum,term)=>sum+(title.includes(term)?3:1),0);
   return [{item,score}];
  }).sort((a,b)=>b.score-a.score||String(b.item.record.updatedAt??'').localeCompare(String(a.item.record.updatedAt??'')));
  const services=[...new Set(readable(snapshots,canRead).map(item=>item.provider))];
  return {ok:true,untrustedContent:true,
   scope:services.length?`Saved World context from ${services.map(p=>SERVICE_TITLES[p]??p).join(', ')}, kept up to date by the World; no live Service read.`:'No saved context this Agent may read yet. The World keeps a Service up to date once it is connected, and this Agent needs "Can read" for it.',
   results:scored.slice(0,SERVICE_CONTEXT_LIMITS.results).map(({item})=>({id:item.provider+':'+item.record.id,provider:item.provider,title:item.record.title,url:item.record.url,
    ...item.record.updatedAt?{updatedAt:item.record.updatedAt}:{},savedAt:new Date(item.snapshot.collectedAt*1000).toISOString(),snippet:snippet(item.record,terms)})),
   hasMore:scored.length>SERVICE_CONTEXT_LIMITS.results};
 }
 if(operation==='read'){
  const id=typeof request.id==='string'?request.id:'';
  const split=id.indexOf(':');
  if(split<1||id.length>600)fail(SERVICE_CONTEXT_REASONS.id);
  const provider=id.slice(0,split),recordId=id.slice(split+1);
  if(!SERVICE_PROVIDERS.includes(provider)||!canRead(provider))fail(SERVICE_CONTEXT_REASONS.missing);
  const found=readable(snapshots,name=>name===provider).find(item=>item.record.id===recordId)??fail(SERVICE_CONTEXT_REASONS.missing);
  const {record,snapshot}=found;
  return {ok:true,untrustedContent:true,scope:snapshot.scope,savedAt:new Date(snapshot.collectedAt*1000).toISOString(),
   record:{id,provider,title:record.title,url:record.url,...record.updatedAt?{updatedAt:record.updatedAt}:{},fields:record.fields,
    ...record.text?{text:[...record.text].slice(0,SERVICE_CONTEXT_LIMITS.text).join('')}:{},...record.comments?{comments:record.comments}:{}}};
 }
 return fail(SERVICE_CONTEXT_REASONS.operation);
}
