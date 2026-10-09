import fs from 'node:fs';
import path from 'node:path';
import {core} from '../../core.ts';
import {MIGRATION_SOURCES,MIGRATION_SOURCE_TITLES,isMigrationSource,worldSinceCutoff,type MigrationSource} from '../../../../../core/agent/index.ts';
import {characterPrefix,digest,isLink,isoSeconds,uuid,writeAtomic,WorldletError} from '../../files.ts';
import {WorldLedger} from '../../store/ledger.ts';
import {swiftJSON,stableJSON} from '../../store/swift-json.ts';
import type {Host,Row} from '../../host/types.ts';
import {AGENT,type AgentService} from '../../host/services.ts';
import policy from '../../../../../contracts/companion-policy.json';

// Companion records (Mac CompanionArchive*, CompanionMemoryEdits, CompanionStyle,
// CompanionTransfer, ConversationJournal, ConversationRecall). The portable
// worldlet.companion v1 files are byte-for-byte the Mac library format.
export interface Scope {sample:boolean;setup:boolean}
const PRIVATE:Scope={sample:false,setup:false};
/** Codable keeps only the declared fields; a decoded archive is re-encoded without extras. */
function normalize(a:Row):Row {
 return {format:a.format,version:a.version,identity:{id:a.identity.id,name:a.identity.name,createdAt:a.identity.createdAt},personality:a.personality,memoryAuthority:a.memoryAuthority,
  memories:a.memories.map((m:Row)=>({id:m.id,kind:m.kind,text:m.text,source:m.source})),
  conversations:a.conversations.map((t:Row)=>({id:t.id,session:t.session,role:t.role,text:t.text,createdAt:t.createdAt}))};
}
export function validate(archive:Row){core('companionValidate',{archive});}
/** Pretty, sorted-key JSON as the Mac `JSONEncoder` wrote it. */
export function encode(archive:Row):string {
 validate(archive);
 const text=JSON.stringify(JSON.parse(stableJSON(archive)),null,2);
 if(Buffer.byteLength(text,'utf8')>policy.maxArchiveBytes)throw new WorldletError('Companion archive exceeds 16 MB.');
 return text;
}
export function decode(data:Buffer|string):Row {
 if(Buffer.byteLength(data)>policy.maxArchiveBytes)throw new WorldletError('Companion archive exceeds 16 MB.');
 let value:Row;
 try{value=JSON.parse(data.toString());}catch{throw new WorldletError('Invalid companion archive.');}
 validate(value);
 return normalize(value);
}
const SESSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sessionMarker=()=>({version:1,session:uuid()});

export function createCompanion(host:Host){
 const {store,preferences,profile}=host;
 const root=profile.root;
 const agent=()=>host.optional<AgentService>(AGENT);
 const external=()=>process.env.WORLDLET_AGENT_CONFIG!==undefined;
 let inheritedName:string|null=null;
 const style={
  name:()=>preferences.string('worldlet.companionName')||inheritedName||'Fox',
  current:()=>preferences.string('worldlet.companionStyle'),
  /** One line, bounded, or nothing at all. */
  clean:(value:string)=>characterPrefix(value.split(/\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/).filter(Boolean).join(' ').trim(),240),
  set:(value:string)=>{const cleaned=style.clean(value);if(cleaned)preferences.set('worldlet.companionStyle',cleaned);else preferences.remove('worldlet.companionStyle');},
  inherit:(name:unknown)=>{inheritedName=typeof name==='string'&&name?name:null;}
 };
 const location=(scope:Scope)=>scope.sample?path.join(root,'companion-profiles','sample'):scope.setup?path.join(root,'companion-profiles','setup'):root;
 const scopeName=(scope:Scope)=>scope.sample?'sample':scope.setup?'setup':'private';

 // Who Fox is: the profile, memory edits and session marker -------------------------------------
 // Kept in the World's database per scope (owner decision 2026-10-03: whatever can be in SQLite
 // is); the conversation itself lives in companion_turns. Each scope's earlier companion/ files
 // (profile.json, memory-edits.json, imported.json) move in once and stay as `.before-database`;
 // files brought back by restoring an older backup are the newer copy then.
 type Stored='profile'|'memory-edits'|'session';
 const LEGACY:Record<Stored,string>={profile:'profile.json','memory-edits':'memory-edits.json',session:'imported.json'};
 function readLegacy(file:string):Row|null {
  if(!fs.existsSync(file)||isLink(file))return null;
  const data=fs.readFileSync(file);
  if(path.basename(file)==='profile.json')return decode(data);
  try{return JSON.parse(data.toString('utf8'));}catch{throw new WorldletError(path.basename(file)==='imported.json'?'Invalid companion session marker.':'Saved memory edits are invalid.');}
 }
 function records(scope:Scope){
  const name=scopeName(scope),folder=path.join(location(scope),'companion');
  const legacy=()=>{const file=path.join(folder,'profile.json');return fs.existsSync(file)&&!isLink(file);};
  if(legacy()&&!store.writable){
   const values=Object.fromEntries((Object.keys(LEGACY) as Stored[]).map(kind=>[kind,readLegacy(path.join(folder,LEGACY[kind]))]));
   return {get:(kind:Stored)=>values[kind] as Row|null,set:()=>{throw new WorldletError('Companion profile is read-only.');},transaction:<T>(work:()=>T)=>work()};
  }
  const ledger=store.ledger();
  if(legacy()){
   const values=(Object.keys(LEGACY) as Stored[]).map(kind=>[kind,readLegacy(path.join(folder,LEGACY[kind]))] as const);
   const turns=(values.find(([kind])=>kind==='profile')?.[1]?.conversations??[]) as Row[];
   ledger.transaction(()=>{for(const [kind,value] of values)ledger.saveCompanionStored(name,kind,kind==='profile'&&value?{...value,conversations:[]}:value);});
   // Turns the profile still held (before conversations moved to the database) join Fox's own.
   if(turns.length)conversationLedger(scope).addCompanionTurns(WorldLedger.OWN,turns as any);
   for(const kind of Object.keys(LEGACY) as Stored[]){const file=path.join(folder,LEGACY[kind]);if(fs.existsSync(file)&&!isLink(file))fs.renameSync(file,file+'.before-database');}
  }
  return {get:(kind:Stored)=>ledger.companionStored(name,kind),set:(kind:Stored,value:Row|null)=>ledger.saveCompanionStored(name,kind,value),transaction:<T>(work:()=>T)=>ledger.transaction(work)};
 }
 function saveArchive(archive:Row,scope:Scope){
  records(scope).set('profile',JSON.parse(encode({...archive,conversations:[]})));
 }
 function sessionGeneration(scope:Scope){
  const value=records(scope).get('session');
  if(!value)return '';
  if(value.version!==1||typeof value.session!=='string'||!SESSION.test(value.session))throw new WorldletError('Invalid companion session marker.');
  return value.session as string;
 }
 function readEdits(scope:Scope):Record<string,string> {
  const value=records(scope).get('memory-edits');
  if(value===null)return {};
  if(typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>typeof v!=='string')||Buffer.byteLength(JSON.stringify(value))>2_100_000)throw new WorldletError('Saved memory edits are invalid.');
  return value as Record<string,string>;
 }
 const applyEdits=(archive:Row,scope:Scope)=>decode(JSON.stringify(core('companionMemoryEdits',{archive,edits:readEdits(scope)})));
 const saveEdits=(edits:Record<string,string>,scope:Scope)=>records(scope).set('memory-edits',edits);
 const revision=(archive:Row)=>digest(swiftJSON(archive.memories));

 // Profiles -----------------------------------------------------------------------------
 function load(scope:Scope){
  const stored=records(scope).get('profile');
  if(stored)return decode(JSON.stringify(stored));
  return {format:policy.format,version:policy.version,identity:{id:uuid(),name:style.name(),createdAt:isoSeconds()},personality:style.current(),memoryAuthority:agent()?.memoryAuthority??'worldlet',memories:[],conversations:[]};
 }
 function archive(scope:Scope=PRIVATE):Row {
  const stored=records(scope).get('profile')!==null;
  let value=load(scope);
  const loaded=stableJSON({...value,conversations:[]});
  let moved=false;
  if(store.writable){
   moved=moveLegacyTurns(value,scope);
   if(!scope.sample&&!scope.setup){
    // Refresh before requests and after replies. A failed read preserves the last
    // complete checkpoint and is retried on the next access.
    const runtime=agent();
    if(runtime){try{value=normalize(runtime.checkpointCompanion(value));validate(value);}catch{host.diagnostics.log('World companion memory checkpoint deferred; retained the previous copy.');value=JSON.parse(loaded);}}
   }
   value=applyEdits(value,scope);
   // Reads happen several times per exchange; only a new or changed profile is written.
   if(!stored||moved||stableJSON({...value,conversations:[]})!==loaded)saveArchive(value,scope);
   // The recent conversation rides along for prompts, the phone and stateless adapters.
   return {...value,conversations:conversationLedger(scope).companionTurns(WorldLedger.OWN,policy.rotateAfterTurns)};
  }
  return value;
 }
 /** Turns from before the database (in the profile itself or in rotated `companion/history/*.json`
  * files, also from a restored older backup) move in; the history folder stays beside it as
  * `history.before-database`. A folder that cannot be read is left alone until the next start. */
 const legacyChecked=new Set<string>();
 function moveLegacyTurns(value:Row,scope:Scope):boolean {
  const base=location(scope),ledger=conversationLedger(scope),turns=[...value.conversations];
  value.conversations=[];
  const folder=path.join(base,'companion','history');
  if(!legacyChecked.has(base)&&fs.existsSync(folder)&&!isLink(folder)){
   try{
    for(const name of fs.readdirSync(folder).filter(file=>file.endsWith('.json'))){
     const file=path.join(folder,name);
     if(isLink(file))continue;
     const segment=decode(fs.readFileSync(file));
     if(segment.identity.id===value.identity.id)turns.push(...segment.conversations);
    }
    ledger.addCompanionTurns(WorldLedger.OWN,turns);
    fs.renameSync(folder,path.join(base,'companion','history.before-database'));
    return true;
   }catch(error){legacyChecked.add(base);host.diagnostics.record(error,'moveLegacyTurns');}
  }
  if(!turns.length)return false;
  ledger.addCompanionTurns(WorldLedger.OWN,turns);
  return true;
 }
 function reference(value:Row,forRecall=false){
  return (external()||forRecall)&&value.memoryAuthority==='hermes'?{...value,memoryAuthority:'worldlet'}:value;
 }
 const prompt=(value:Row)=>core<string>('companionPrompt',{archive:value});
 function update({name,personality}:{name?:string,personality?:string}){
  if(!store.writable)throw new WorldletError('Companion profile is read-only.');
  // Identity and explicit style are shared; private memories are not.
  for(const scope of [PRIVATE,{sample:true,setup:false},{sample:false,setup:true}]){
   const value=archive(scope);
   if(name!==undefined)value.identity.name=name;
   if(personality!==undefined)value.personality=personality;
   saveArchive(value,scope);
  }
 }
 function session(scope:Scope){
  const value=archive(scope);
  // Foreground Fox owns one session; the legacy thread argument is only a UI anchor.
  return 'context-'+digest(value.identity.id+sessionGeneration(scope)+'fox-main');
 }
 /** `thread`: the place and view the turn was said in (the chat's context key), '' when none. */
 function recordTurn(text:string,role:'user'|'assistant',sessionID:string,scope:Scope,thread=''){
  if(!store.writable)throw new WorldletError('Companion history is read-only.');
  archive(scope);
  const messageId=uuid();
  conversationLedger(scope).addCompanionTurns(WorldLedger.OWN,[{id:messageId,session:sessionID,role,text,createdAt:isoSeconds(),thread}]);
  if(!scope.sample&&!scope.setup){
   // A short local preview, with a stable reference to the full archive.
   store.recordHistory({id:messageId,kind:'conversation.message',at:Date.now()/1000,actor:role==='user'?'user':'fox',messageId,preview:characterPrefix(text,240)},sessionID);
  }
 }

 // Transfer -----------------------------------------------------------------------------
 /** The portable archive: the profile with every one of Fox's own turns (brought ones stay out). */
 function capture(profileArchive:Row):Row {
  const result={...profileArchive,conversations:store.writable?conversationLedger(PRIVATE).companionTurns(WorldLedger.OWN):[...profileArchive.conversations]};
  encode(result);return result;
 }
 function exportArchive(){
  if(store.sampleEnabled())throw new WorldletError('Switch to your personal world to export your companion.');
  const runtime=agent();if(!runtime)throw new WorldletError('Fox is unavailable in this build.');
  const value=normalize(runtime.captureCompanion(capture(archive()),records(PRIVATE).get('session')!==null));
  return encode(value);
 }
 function importArchive(portable:Row){
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Import requires a writable personal world.');
  validate(portable);
  const runtime=agent();if(!runtime)throw new WorldletError('Fox is unavailable in this build.');
  const current=capture(archive()),saved=records(PRIVATE);
  const imported=saved.get('session')!==null,existed=saved.get('profile')!==null;
  // The previous companion (as the Harness last knew it) is kept as one portable archive file.
  const rollback=runtime.installCompanion(portable,current,imported,(replacement:Row,recovery:Row|null)=>{
   const kept=existed?path.join(root,'companion-before-import-'+uuid().toUpperCase()+'.json'):null;
   if(kept)writeAtomic(kept,encode(recovery??current));
   saved.transaction(()=>{saveArchive(replacement,PRIVATE);saved.set('memory-edits',null);saved.set('session',sessionMarker());});
   return kept;
  });
  // The imported conversation replaces Fox's own; the previous one stays in the recovery copy.
  store.ledger().replaceCompanionHistory(WorldLedger.OWN,{turns:portable.conversations,notes:[]});
  preferences.set('worldlet.companionName',portable.identity.name);style.set(portable.personality);
  return rollback;
 }
 // Brought-in history (OpenClaw, Claude Code, pi, Hermes Agent, Codex) -----------------------
 // Another Agent's whole history joins Fox's own turns in the World's database, marked with the
 // Agent it came from: searched by recall after Fox's own, kept by backup with the database, left
 // out of the 16 MB companion export (the originals stay with that Agent). Before 2026-10-03 it
 // was archive files in `companion/<agent>/`; those move in once and stay as `<agent>.before-database`.
 type BroughtHistory={conversations:{id:string;title:string;session:string;turns:{id:string;role:string;text:string;createdAt:string}[]}[];notes:{id:string;session:string;date:string;text:string;createdAt:string}[]};
 const broughtTurns=(history:BroughtHistory)=>history.conversations.flatMap(c=>c.turns.map(turn=>({...turn,session:c.session})));
 const legacyFailed=new Set<string>();
 function moveLegacyBrought(){
  if(!store.writable||store.sampleEnabled())return;
  for(const source of MIGRATION_SOURCES){
   const folder=path.join(root,'companion',source);
   if(legacyFailed.has(source)||!fs.existsSync(folder)||isLink(folder))continue;
   const identity=archive().identity.id;
   const turns:Row[]=[];
   try{
    for(const name of fs.readdirSync(folder).filter(file=>file.endsWith('.json')).sort()){
     const file=path.join(folder,name);
     if(isLink(file))continue;
     const segment=decode(fs.readFileSync(file));
     if(segment.identity.id===identity)turns.push(...segment.conversations);
    }
    // Notes were kept as one conversation per Agent ("OpenClaw notes"), each opening with its date.
    const notesTitle=MIGRATION_SOURCE_TITLES[source]+' notes',notes:BroughtHistory['notes']=[],conversation:Row[]=[];
    for(const turn of turns){
     if(turn.session===notesTitle||String(turn.session).startsWith(notesTitle+' · ')){
      const date=/^Notes for (\d{4}-\d{2}-\d{2})\n\n/.exec(turn.text)?.[1]??'';
      notes.push({id:turn.id,session:turn.session,date,text:date?turn.text.slice(`Notes for ${date}\n\n`.length):turn.text,createdAt:turn.createdAt});
     }else conversation.push(turn);
    }
    store.ledger().replaceCompanionHistory(source,{turns:conversation as any,notes});
    fs.renameSync(folder,path.join(root,'companion',source+'.before-database'));
   }catch(error){legacyFailed.add(source);host.diagnostics.record(error,'moveLegacyBrought');}
  }
 }
 /** Replaces everything brought in from `source`. Returns how many turns and notes it holds. */
 function replaceImportedHistory(source:MigrationSource,history:BroughtHistory):number {
  if(!isMigrationSource(source))throw new WorldletError('Unknown Agent to bring history from.');
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Return to your own world before bringing another Agent’s history.');
  moveLegacyBrought();
  return store.ledger().replaceCompanionHistory(source,{turns:broughtTurns(history),notes:history.notes});
 }
 /** Adds older conversations to what `source` brought (fox/older-history.ts); turns already here stay. */
 function addImportedHistory(source:MigrationSource,history:Pick<BroughtHistory,'conversations'>):number {
  if(!isMigrationSource(source))throw new WorldletError('Unknown Agent to bring history from.');
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Return to your own world before bringing another Agent’s history.');
  return store.ledger().addCompanionTurns(source,broughtTurns({...history,notes:[]}));
 }
 /** Memory first, then Fox's own conversation newest first, then what other Agents brought. */
 const recall=(args:Row)=>{
  const profile=reference(archive(),true),memories=(next:Row)=>core<Row>('companionRecall',{archive:{...profile,conversations:[]},args:next});
  if(!store.writable)return core<Row>('companionRecall',{archive:profile,args});
  moveLegacyBrought();
  const ledger=store.ledger();
  if(typeof args.id==='string'&&args.id){
   try{return memories(args);}catch(error){
    const row=ledger.companionRecord(args.id);
    if(!row)throw error;
    // Same paging and record shape as the companion archive's own recall.
    const result=core<Row>('companionRecall',{archive:{...profile,memoryAuthority:'hermes',conversations:[{id:row.id,session:row.session,role:row.role,text:row.text,createdAt:row.createdAt}]},args});
    return {...result,records:result.records.map((record:Row)=>({...record,kind:row.kind}))};
   }
  }
  const offset=args.offset??0;
  if(typeof offset!=='number'||!Number.isInteger(offset)||offset<0)return memories(args);
  const query=typeof args.query==='string'?args.query:'';
  const first=memories({...args,offset:0}),memoryTotal=Number(first.total??0);
  const total=memoryTotal+ledger.searchCompanion(query,0,0).total;
  if(offset>total)throw new Error('Companion result offset is out of range.');
  const records:Row[]=offset<memoryTotal?[...memories(args).records]:[];
  if(records.length<5){
   const trim=(row:Row)=>{const chars=Array.from(String(row.text));return {...row,text:chars.slice(0,600).join(''),truncated:chars.length>600};};
   records.push(...ledger.searchCompanion(query,Math.max(0,offset-memoryTotal),5-records.length).rows.map(trim));
  }
  const shown=offset+records.length;
  return {records,total,referenceOnly:true,memoryAuthority:first.memoryAuthority,...(shown<total?{nextOffset:shown}:{})};
 };

 // Memory manager -----------------------------------------------------------------------
 function memoryManager(body:Row):Row {
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Open your personal world to manage memory.');
  let value=archive();
  const runtime=agent();
  const attached=runtime?.id==='hermes'&&runtime.profile(false)?.bound===true;
  const editable=!external()&&!attached&&typeof runtime?.replaceCompanionMemories==='function';
  if(body.operation==='save'){
   const kind=body.kind,text=body.text;
   if(!editable||!['user','longTerm'].includes(kind)||typeof text!=='string'||Buffer.byteLength(text,'utf8')>1_000_000||body.revision!==revision(value))throw new WorldletError('Memory changed or belongs to an attached Agent. Reload before editing.');
   const edits=readEdits(PRIVATE);edits[kind]=text;
   // One transaction: a Harness write that fails leaves the saved records as they were.
   records(PRIVATE).transaction(()=>{
    saveEdits(edits,PRIVATE);
    value=applyEdits(value,PRIVATE);
    runtime!.replaceCompanionMemories!(value.memories,()=>{saveArchive(value,PRIVATE);records(PRIVATE).set('session',sessionMarker());});
   });
  }
  const edits=readEdits(PRIVATE);
  return {revision:revision(value),editable,sections:['user','longTerm'].map(kind=>({kind,text:value.memories.filter((m:Row)=>m.kind===kind).map((m:Row)=>m.text).join('\n\n'),managed:edits[kind]!==undefined})),
   scope:'Saved memory sections only. Conversations, connected sources and prior exported backups remain. Edited sections stay user-managed so runtime checkpoints cannot restore older content.'};
 }

 /** Copies the name and memory of the person's own Agent (Hermes Agent, OpenClaw) in at setup.
  * Imported text is appended after anything Fox already remembers, then owned by Fox like any memory
  * (not pinned as a user edit, so Fox keeps learning); the source Agent's files are not touched. */
 function adoptMemory(memory:{name:string|null,soul?:string,user:string,longTerm:string,source:string}):Row {
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Return to your own world before bringing an Agent’s memory.');
  const runtime=agent();
  // Only copying memory needs Fox's own Harness; a name alone is Fox's (an Agent Fox talks through keeps its memory).
  const copies=['soul','user','longTerm'].some(kind=>(memory as any)[kind]?.trim());
  if(copies&&(external()||typeof runtime?.replaceCompanionMemories!=='function'))throw new WorldletError('Fox cannot take another Agent’s memory in this build.');
  let value=archive();
  const brought:string[]=[];
  const memories=[...value.memories];
  // Its persona joins Fox's own (Hermes SOUL.md), like its memory, so it is the same Agent.
  for(const kind of ['soul','user','longTerm'] as const){
   const text=(memory[kind]??'').trim();
   if(!text)continue;
   const current=memories.filter((m:Row)=>m.kind===kind).map((m:Row)=>m.text).join('\n\n').trim();
   if(current.includes(text))continue;
   const merged=current?current+'\n\n'+text:text;
   if(Buffer.byteLength(merged,'utf8')>1_000_000)throw new WorldletError('That Agent’s memory is too large to bring.');
   const at=memories.findIndex((m:Row)=>m.kind===kind);
   const entry={id:'hermes-'+kind,kind,text:merged,source:memory.source};
   for(let i=memories.length-1;i>=0;i--)if(memories[i].kind===kind)memories.splice(i,1);
   memories.splice(at<0?memories.length:at,0,entry);
   brought.push(kind);
  }
  if(brought.length){
   value={...value,memories};
   records(PRIVATE).transaction(()=>runtime!.replaceCompanionMemories!(value.memories,()=>{saveArchive(value,PRIVATE);records(PRIVATE).set('session',sessionMarker());}));
  }
  const name=memory.name?style.clean(memory.name):'';
  if(name){update({name});preferences.set('worldlet.companionName',name);}
  return {name:name||null,memories:brought};
 }

 // Conversation journal and recall --------------------------------------------------------
 const ledgers=new Map<string,WorldLedger>();
 function conversationLedger(scope:Scope){
  if(!scope.sample&&!scope.setup)return store.ledger();
  const name=scopeName(scope);
  let db=ledgers.get(name);
  if(!db){db=new WorldLedger(location(scope));ledgers.set(name,db);}
  return db;
 }
 /** A failed save fails the send/delivery; conversation evidence is not optional analytics. */
 function recordEvent(request:string,type:string,scope:Scope,text?:string|null){
  if(!store.writable)throw new WorldletError('Cannot save this conversation.');
  const input:Row={id:uuid(),requestId:request,type,at:Date.now()/1000,scope:scopeName(scope)};
  if(typeof text==='string')input.text=text;
  const entries=core<Row[]>('conversationEntries',input);
  const db=conversationLedger(scope);
  db.transaction(()=>{for(const entry of entries)db.append(entry,request);});
 }
 /** What Fox's chat shows place by place (its cards and each place's last reply), kept in the
  * World's database; the file it was kept in before moves in once and stays as `.before-database`. */
 function conversationRecall(rows?:unknown):Row[] {
  if(store.sampleEnabled())return [];
  const file=path.join(root,'conversation-recall.json');
  const readFile=()=>{
   const data=fs.readFileSync(file);
   let saved:unknown=null;
   try{if(data.length<=5_000_000)saved=JSON.parse(data.toString('utf8'));}catch{}
   if(!Array.isArray(saved))throw new WorldletError('Saved conversation history is invalid.');
   core('conversationHistoryValidate',{rows:saved,writing:false});
   return saved as Row[];
  };
  const legacy=fs.existsSync(file)&&!isLink(file);
  if(rows!==undefined){
   if(!store.writable||!Array.isArray(rows))throw new WorldletError('Invalid conversation history.');
   if(Buffer.byteLength(JSON.stringify(rows),'utf8')>5_000_000)throw new WorldletError('Conversation history is too large.');
   core('conversationHistoryValidate',{rows,writing:true});
   store.ledger().replaceCompanionViews(rows);
   if(legacy)try{fs.renameSync(file,file+'.before-database');}catch{}
   return rows;
  }
  if(!legacy)return store.ledger().companionViews();
  const saved=readFile();
  if(!store.writable)return saved;
  const ledger=store.ledger();
  // A World restored from an older backup brings the file back; it is the newer copy then.
  ledger.replaceCompanionViews(saved);
  fs.renameSync(file,file+'.before-database');
  return ledger.companionViews();
 }
 function closeLedgers(){for(const db of ledgers.values())db.close();ledgers.clear();}

 /** This place's earlier turns and where the previous turn was said (spatial context switching). */
 /** When the resident session of `thread` last replied (epoch seconds), or null (core/agent/world-since.ts). */
 function lastReply(scope:Scope,thread:string):number|null {return worldSinceCutoff(conversationLedger(scope).recentTurnPlaces(400),thread);}
 function place(scope:Scope,thread:string){
  if(!thread)return null;
  const ledger=conversationLedger(scope);
  return core<Row|null>('conversationPlace',{thread,turns:ledger.threadTurns(thread,8),previous:ledger.previousThread('')});
 }
 return {style,archive,reference,prompt,update,session,place,lastReply,recordTurn,capture,exportArchive,importArchive,recall,replaceImportedHistory,addImportedHistory,memoryManager,adoptMemory,recordEvent,conversationRecall,closeLedgers,decode};
}
export type Companion=ReturnType<typeof createCompanion>;
