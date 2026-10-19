// The one way in to Context (#676): every Context domain is read, written and searched through this entry. Records keep
// the formats they are stored in today; the envelope (id, kind, origin, times, revision, derivedFrom) is read from each
// stored record, not written beside it. Platform persists (it gives a `ContextStorage`); this decides who may write what.
// Rules (scripts/architecture-boundaries.ts): UI only reads Context, so `ui/` never imports `contextWriter`; only
// Connectors write the Synced kind, so only `context/connectors/` imports `syncedWriter`.

type Row=Record<string,any>;
export const CONTEXT_KINDS=['synced','recorded','made','known'] as const;
export type ContextKind=typeof CONTEXT_KINDS[number];
/** Who a record came from: a Service, an Agent (by its agentId), the person, Fox or the World itself. */
export type ContextOrigin={by:'service'|'agent'|'person'|'fox'|'world';id?:string};
/** The envelope every Context record has, whatever its domain. Times are milliseconds since 1970, or null when the
 * stored record has none. */
export type ContextEnvelope={id:string;kind:ContextKind;domain:ContextDomainId;origin:ContextOrigin;createdAt:number|null;updatedAt:number|null;revision:number|null;derivedFrom:string[]};
/** One record through the entry: its envelope, and the record exactly as it is stored. */
export type ContextRecord<T=Row>=ContextEnvelope&{body:T};

/** Every Context domain, its kind and where it is kept today (context/store/STORAGE.md#four-kinds). */
export const CONTEXT_DOMAINS=[
 {id:'service-sync',kind:'synced',label:'Service sync',storage:'state.service-sync-snapshots'},
 {id:'source-facts',kind:'synced',label:'Source collection facts',storage:'state.attention-context'},
 {id:'sources',kind:'synced',label:'Sources',storage:'sources table and sources/ files'},
 {id:'conversations',kind:'recorded',label:'Conversations',storage:'companion_turns, companion_notes'},
 {id:'chat-by-place',kind:'recorded',label:'Chat by place',storage:'companion_cards, companion_views'},
 {id:'history',kind:'recorded',label:'History and execution journal',storage:'entries, execution_payloads'},
 {id:'execution',kind:'recorded',label:'Execution',storage:'state.runs, state.attention-budget'},
 {id:'attention-reviews',kind:'recorded',label:'Attention decisions',storage:'state.reviews'},
 {id:'agent-asks',kind:'recorded',label:'Agent asks',storage:'state.agent-asks, agent_ask_attachments'},
 {id:'agent-reports',kind:'recorded',label:'Agent reports',storage:'state.agent-reports'},
 {id:'service-requests',kind:'recorded',label:'Service requests',storage:'state.service-requests'},
 {id:'web-recordings',kind:'recorded',label:'Website recordings',storage:'web_visits, web_records'},
 {id:'browser-visits',kind:'recorded',label:'Browsing history',storage:'browser_visits'},
 {id:'brought-agents',kind:'recorded',label:'Brought Agents',storage:'brought_skills, brought_routines'},
 {id:'artifacts',kind:'made',label:'Artifacts',storage:'artifacts'},
 {id:'artifact-pages',kind:'made',label:'Artifact pages',storage:'artifact_pages'},
 {id:'widgets',kind:'made',label:'Moment Applets',storage:'my_applets (page)'},
 {id:'made-games',kind:'made',label:'Made games',storage:'made_games, made_game_versions'},
 {id:'ongoing',kind:'made',label:'Ongoing things',storage:'my_applets (conversation)'},
 {id:'calendar-events',kind:'made',label:'Local calendar events',storage:'calendar_events'},
 {id:'board',kind:'made',label:'Board',storage:'state.board'},
 {id:'service-presets',kind:'made',label:'Service presets',storage:'state.service-presets'},
 {id:'github-drafts',kind:'made',label:'GitHub drafts',storage:'state.github-drafts'},
 {id:'service-drafts',kind:'made',label:'PostHog and Notion drafts',storage:'state.service-drafts'},
 {id:'mail-reviews',kind:'made',label:'Email drafts',storage:'mail_reviews'},
 {id:'coding-tasks',kind:'made',label:'Codex coding tasks',storage:'coding_tasks'},
 {id:'companion',kind:'known',label:'Companion',storage:'companion_profile'},
 {id:'attention-items',kind:'known',label:'Attention items',storage:'state.items'},
 {id:'knowledge',kind:'known',label:'Knowledge',storage:'knowledge table'},
] as const satisfies readonly {id:string;kind:ContextKind;label:string;storage:string}[];
export type ContextDomainId=typeof CONTEXT_DOMAINS[number]['id'];
export type ContextDomain=typeof CONTEXT_DOMAINS[number];

/** A change to one domain, in its stored shape: records to save, ids to forget, and what goes with them (a page, its
 * state, the Attention item of a draft). */
export type ContextChange={save?:Row[];forget?:string[];with?:Row};
/** How Platform keeps one domain. `rows` lists its records as stored; `search` is a domain's own index (conversations,
 * website recordings) when listing every row would be too much; `write` applies a change as one save. */
export type ContextDomainStore={rows?():Row[];get?(id:string):Row|null;search?(terms:string[],limit:number):Row[];write?(change:ContextChange):void};
/** What Platform gives the entry: the domains it keeps, and a transaction when several writes must land together. */
export type ContextStorage={domains:Partial<Record<ContextDomainId,ContextDomainStore>>;transaction?<T>(work:()=>T):T};

export function contextDomain(id:string):ContextDomain {
 const domain=CONTEXT_DOMAINS.find(item=>item.id===id);
 if(!domain)throw Error(`Unknown Context domain: ${id}.`);
 return domain;
}
const store=(storage:ContextStorage,id:ContextDomainId)=>{
 contextDomain(id);
 const kept=storage.domains[id];
 if(!kept)throw Error(`This World does not keep ${contextDomain(id).label.toLowerCase()} here.`);
 return kept;
};

const ID_FIELDS:Partial<Record<ContextDomainId,string>>={'agent-reports':'agentId'};
const SERVICE_FIELDS=['provider','origin','service','source'];
/** A stored time as milliseconds: seconds and milliseconds since 1970 and ISO strings are all used today. */
export function contextTime(value:unknown):number|null {
 if(typeof value==='number'&&Number.isFinite(value)&&value>0)return value<1e11?Math.round(value*1000):Math.round(value);
 if(typeof value==='string'&&value){const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;}
 return null;
}
function origin(kind:ContextKind,row:Row):ContextOrigin {
 const text=(value:unknown)=>typeof value==='string'&&value?value:undefined;
 if(kind==='synced'){const id=SERVICE_FIELDS.map(field=>text(row[field])).find(Boolean);return id?{by:'service',id}:{by:'service'};}
 const agent=text(row.agentId)??text(row.agent);
 if(agent)return {by:'agent',id:agent};
 const by=text(row.origin)??text(row.by)??text(row.author);
 if(by==='user'||by==='person')return {by:'person'};
 if(by==='fox')return {by:'fox'};
 if(by==='agent')return {by:'agent'};
 return {by:'world'};
}
function derivedFrom(row:Row):string[] {
 const out:string[]=[];
 const add=(value:unknown)=>{if(typeof value==='string'&&value&&!out.includes(value))out.push(value);};
 for(const field of ['derivedFrom','sourceIds','sourceIDs'])if(Array.isArray(row[field]))row[field].forEach(add);
 if(Array.isArray(row.sources))for(const source of row.sources)add(typeof source==='string'?source:source?.id??source?.sourceId);
 for(const field of ['artifact','sourceId','sourceID'])add(row[field]);
 return out;
}
/** The envelope of one stored record of a domain, read from the fields it already has. */
export function contextEnvelope(domain:ContextDomainId,row:Row):ContextEnvelope {
 const {kind}=contextDomain(domain),field=ID_FIELDS[domain]??'id';
 const revision=[row.revision,row.version].find(value=>typeof value==='number'&&Number.isFinite(value));
 return {id:String(row[field]??row.id??row.key??''),kind,domain,origin:origin(kind,row),
  createdAt:contextTime(row.createdAt??row.startedAt??row.madeAt),updatedAt:contextTime(row.updatedAt??row.savedAt??row.collectedAt??row.at??row.createdAt),
  revision:revision??null,derivedFrom:derivedFrom(row)};
}
const record=<T extends Row>(domain:ContextDomainId,row:T):ContextRecord<T>=>({...contextEnvelope(domain,row),body:row});

/** One hit of the search across kinds. */
export type ContextHit={record:ContextRecord;title:string;snippet:string;score:number};
export type ContextQuery={kinds?:readonly ContextKind[];domains?:readonly ContextDomainId[];limit?:number};
export const CONTEXT_SEARCH_LIMITS={results:50,rowText:20_000,snippet:160,terms:12};
/** The words a search looks for: lower case, at most a dozen, each at least two characters. */
export function contextTerms(query:string):string[] {
 return [...new Set(String(query??'').toLowerCase().split(/\s+/).filter(term=>term.length>1))].slice(0,CONTEXT_SEARCH_LIMITS.terms);
}
function rowText(row:unknown,limit=CONTEXT_SEARCH_LIMITS.rowText):string {
 const parts:string[]=[];let size=0;
 const walk=(value:unknown,depth:number)=>{
  if(size>=limit||depth>6)return;
  if(typeof value==='string'){parts.push(value);size+=value.length+1;}
  else if(Array.isArray(value))for(const item of value)walk(item,depth+1);
  else if(value&&typeof value==='object')for(const item of Object.values(value))walk(item,depth+1);
 };
 walk(row,0);
 return parts.join(' ').slice(0,limit);
}
const titleOf=(row:Row,id:string)=>String([row.title,row.name,row.label,row.question,row.text].find(value=>typeof value==='string'&&value.trim())??id).slice(0,200);
function snippet(text:string,terms:string[]):string {
 const lower=text.toLowerCase(),at=Math.max(0,Math.min(...terms.map(term=>{const index=lower.indexOf(term);return index<0?Infinity:index;}))-40);
 const clipped=text.slice(Number.isFinite(at)?at:0).replace(/\s+/g,' ').trim();
 return clipped.length>CONTEXT_SEARCH_LIMITS.snippet?clipped.slice(0,CONTEXT_SEARCH_LIMITS.snippet-1)+'…':clipped;
}
function score(text:string,title:string,terms:string[]):number {
 const lower=text.toLowerCase(),heading=title.toLowerCase();let total=0;
 for(const term of terms){
  let count=0;for(let at=lower.indexOf(term);at>=0&&count<50;at=lower.indexOf(term,at+term.length))count++;
  if(!count)return 0;
  total+=count+(heading.includes(term)?5:0);
 }
 return total;
}

/** Reading Context: every domain, one record or the search across kinds. Anyone may read; Grants decide what an Agent
 * sees before it gets here. */
export function contextReader(storage:ContextStorage) {
 const rows=(domain:ContextDomainId):Row[]=>{const kept=store(storage,domain);return kept.rows?kept.rows():[];};
 return {
  domains:()=>CONTEXT_DOMAINS.filter(domain=>storage.domains[domain.id]),
  has:(domain:ContextDomainId)=>!!storage.domains[domain],
  /** Every record of a domain, as stored, in the order the domain keeps them. */
  read:<T extends Row=Row>(domain:ContextDomainId):ContextRecord<T>[]=>rows(domain).map(row=>record(domain,row as T)),
  /** The stored records alone, for callers that only need what they always read. */
  bodies:<T extends Row=Row>(domain:ContextDomainId):T[]=>rows(domain) as T[],
  get:<T extends Row=Row>(domain:ContextDomainId,id:string):ContextRecord<T>|null=>{
   const kept=store(storage,domain);
   const row=kept.get?kept.get(id):(kept.rows?kept.rows():[]).find(item=>contextEnvelope(domain,item).id===id)??null;
   return row?record(domain,row as T):null;
  },
  /** Full text across kinds: every term must appear; title matches and repeated terms rank first, then the newest. */
  search:(query:string,{kinds,domains,limit=20}:ContextQuery={}):ContextHit[]=>{
   const terms=contextTerms(query);
   if(!terms.length)return [];
   const max=Math.max(1,Math.min(CONTEXT_SEARCH_LIMITS.results,Math.floor(limit)||20)),hits:ContextHit[]=[];
   for(const domain of CONTEXT_DOMAINS){
    if(kinds&&!kinds.includes(domain.kind)||domains&&!domains.includes(domain.id))continue;
    const kept=storage.domains[domain.id];
    if(!kept)continue;
    let candidates:Row[]=[];
    try{candidates=kept.search?kept.search(terms,max):kept.rows?kept.rows():[];}catch{continue;}
    for(const row of candidates){
     const found=record(domain.id,row),title=titleOf(row,found.id),text=rowText(row),value=score(text,title,terms);
     if(value>0||kept.search)hits.push({record:found,title,snippet:snippet(text,terms),score:Math.max(value,1)});
    }
   }
   return hits.sort((a,b)=>b.score-a.score||(b.record.updatedAt??0)-(a.record.updatedAt??0)).slice(0,max);
  },
 };
}
export type ContextReader=ReturnType<typeof contextReader>;

function writer(storage:ContextStorage,allowed:(kind:ContextKind)=>boolean,refusal:string) {
 const change=(domain:ContextDomainId,work:ContextChange)=>{
  const {kind,label}=contextDomain(domain);
  if(!allowed(kind))throw Error(refusal.replace('{label}',label));
  const kept=store(storage,domain);
  if(!kept.write)throw Error(`${label} cannot be changed here.`);
  kept.write(work);
 };
 return {
  /** Saves records of a domain in their stored shape, and forgets the ids given, as one save. */
  write:(domain:ContextDomainId,work:ContextChange)=>change(domain,work),
  remove:(domain:ContextDomainId,ids:string[])=>{if(ids.length)change(domain,{forget:ids});},
  /** Several writes that land together, or none of them. */
  transaction:<T>(work:()=>T):T=>storage.transaction?storage.transaction(work):work(),
 };
}
/** Writing Recorded, Made and Known Context. Agents, the person, Fox and the World write here; Synced is refused, since
 * only Connectors write it (`syncedWriter`). UI never writes: it asks Agent. */
export function contextWriter(storage:ContextStorage,_author:Exclude<ContextOrigin['by'],'service'>|ContextOrigin) {
 return writer(storage,kind=>kind!=='synced','{label} is kept up to date by its Connector; nothing else writes it.');
}
/** Writing Synced Context: the bounded copies of Services. Only Connectors (context/connectors) use this. */
export function syncedWriter(storage:ContextStorage,_service:string) {
 return writer(storage,kind=>kind==='synced','Only Recorded, Made and Known Context is written there; {label} is not Synced.');
}
export type ContextWriter=ReturnType<typeof contextWriter>;
