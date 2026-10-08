import {core} from '../../core.ts';
import {attentionImageURL} from '../../../../../core/attention/index.ts';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';
import type {AttentionCenter} from './center.ts';
import {CONTEXT_CHANGED,SOURCE_PAUSED,uuid,message,isValidation,isCancel,isRow,rows,strings,withinCharacters,characterCount,characterPrefix,httpsLinks} from './util.ts';

export const WORLD_TOOL_NAMES=['read_companion_archive','meeting_decisions','_source_begin','_source_result','query_world_items','upsert_world_items','review_world_item','update_world_item','archive_world_items','configure_world_check','read_world_history'];
const TRACKED=['_source_result','upsert_world_items','review_world_item','update_world_item','archive_world_items','configure_world_check','meeting_decisions'];
const UNVERIFIED='Source evidence was not read or cannot be verified.';

/** Validation belongs to the tool result so the agent can correct its arguments; cancellation
 * and infrastructure errors still abort the turn. */
export async function worldToolReply(center:AttentionCenter,name:string,args:Row,turn:string,monitorProvider?:string):Promise<Row> {
 const store=center.store;
 const recordOutcome=(status:string)=>{
  if(!TRACKED.includes(name)||!store.writable||!store.state.cloudConsent||store.sampleEnabled())return;
  let body:Row={};
  try{const event=core('worldEvent',{action:'applet.activity',body:args});if(isRow(event?.body))body=event.body;}catch{}
  body.actor='fox';body.operation=name;body.status=status;body.runId=turn;
  if(Array.isArray(args.records))body.count=args.records.length;
  // Each outcome is its own event: a repeated tool call is a legitimate second action, not a retry.
  store.recordHistory({...body,...(typeof body.id==='string'?{targetId:body.id}:{}),id:uuid(),kind:'applet.activity',at:Date.now()/1000},monitorProvider??(typeof args.provider==='string'?args.provider:''));
 };
 try{
  const result=await worldTool(center,name,args,turn,monitorProvider);
  recordOutcome(result.error!=null||args.failed===true?'failed':'complete');
  return result;
 }catch(error){
  if(isCancel(error)||!isValidation(error)){recordOutcome(isCancel(error)?'cancelled':'failed');throw error;}
  recordOutcome('failed');
  const text=message(error);
  const reply:Row={error:text,guidance:'Do not claim success. Correct the field or prerequisite identified by the error, preserving valid source evidence. Retry the corrected submission; unaccepted records remain pending.'};
  if(name==='upsert_world_items')center.persist(error,'worldItemSave',turn);
  if(name==='upsert_world_items'&&text===UNVERIFIED&&store.state.cloudConsent){
   reply.guidance='Correct the indexed evidence issues below. Use the supplied sourceReference identity and a short continuous exact quote; do not translate, paraphrase or join passages. Unaccepted records remain pending.';
   // Return only previously authorized evidence for the requested records; validation stays strict.
   const submitted=rows(args.items),evidence=store.worldEvidence[turn]??{};
   const authorized=store.attentionProviders.filter(provider=>center.attentionSourceAuthorized(provider,turn));
   try{reply.evidenceIssues=core('sourceEvidenceIssues',{items:submitted,evidence,authorizedProviders:authorized});}catch{}
   const seen=new Set<string>(),sources:Row[]=[];
   for(const ref of submitted.flatMap(item=>rows(item.sources))){
    const p=ref.provider,id=ref.id;
    if(typeof p!=='string'||typeof id!=='string'||!center.connected(p))continue;
    const read=evidence[p+':'+id];
    if(!read||read.metadataOnly===true||typeof read.text!=='string'||seen.has(p+':'+id))continue;
    seen.add(p+':'+id);sources.push({provider:p,id,text:read.text});
    if(sources.length===3)break;
   }
   reply.readSources=sources;
  }
  return reply;
 }
}

export async function worldTool(center:AttentionCenter,name:string,args:Row,turn:string,monitorProvider?:string):Promise<Row> {
 const store=center.store;
 if(!store.writable||!store.state.cloudConsent||store.sampleEnabled())throw new WorldletError('Allow private context in your personal world first.');
 const db=store.ledger();
 if(monitorProvider!==undefined&&!center.enabledCheck(monitorProvider))throw new WorldletError('This source check is paused.');
 if(name==='query_world_items'){
  const provider=monitorProvider??(typeof args.provider==='string'?args.provider:undefined);
  const result=core('worldItemsQuery',{items:db.records('items'),checks:db.records('checks'),provider});
  if(!isRow(result))throw new WorldletError('Invalid item query result.');
  result.operations=core('runtimeOperationReport',{rows:db.records('runtime-operations'),owner:provider});
  result.workflows=core('browserWorkflowReport',{receipts:db.records('browser-actions'),items:db.records('items'),owner:provider});
  const runtime=center.runtimeTaskReport();
  if(provider!==undefined)runtime.rows=rows(runtime.rows).filter(row=>row.owner===provider);
  result.runtimeTasks=runtime;
  result.taskReviews=db.settledTaskReviews().filter(row=>provider===undefined||row.proposal?.provider===provider);
  return result;
 }
 if(name==='meeting_decisions'){
  const evidence=store.worldEvidence[turn]??{};
  const event=typeof args.eventId==='string'?evidence['google-calendar:'+args.eventId]:undefined;
  const decisions=args.decisions;
  if(monitorProvider!==undefined||!event||!center.connected('google-calendar')||!Array.isArray(decisions)||decisions.length>20)throw new WorldletError('Read the meeting event and authorized minutes in this conversation first.');
  const verified:Row[]=[];
  for(const decision of decisions){
   const provider=decision?.provider,id=decision?.id,quote=decision?.quote;
   const source=typeof provider==='string'&&typeof id==='string'?evidence[provider+':'+id]:undefined;
   if(typeof provider!=='string'||!['notion','apple-notes'].includes(provider)||!center.connected(provider)||typeof id!=='string'||typeof quote!=='string'||characterCount(quote)<10||!withinCharacters(quote,1000)||!source||typeof source.text!=='string'||!source.text.includes(quote))throw new WorldletError('A decision must cite the exact minutes read this turn. Calendar titles are insufficient.');
   verified.push({text:quote,provider,id,url:source.url??'',title:source.title??'Minutes'});
  }
  return {event,decisions:verified,scope:'Evidence excerpts from the supplied minutes. No external changes or coding run.'};
 }
 if(name==='_source_begin'){
  const provider=args.provider;
  if(typeof provider!=='string'||!center.checkProviders().includes(provider)||monitorProvider!==undefined&&provider!==monitorProvider||!center.connected(provider)||(center.readCounts.get(turn)??0)>=6)throw new WorldletError('Source is unavailable or this turn reached its read limit.');
  center.readCounts.set(turn,(center.readCounts.get(turn)??0)+1);
  const ticket=uuid();
  if(!center.readTickets.has(turn))center.readTickets.set(turn,new Map());
  center.readTickets.get(turn).set(ticket,provider);
  center.receiveAppletEvent({provider,callId:ticket,phase:'reading'},turn);
  const result:Row={ticket};
  if(center.nativeConnected(provider)){
   try{
    const reader=center.sources()?.readNative;
    if(!reader)throw new WorldletError('This source cannot be read on this computer.');
    const read=await reader.call(center.sources(),provider);
    result.records=read.map(row=>({...row,provider,text:characterPrefix(String(row.text??''),12000),allDay:row.allDay==='true',completed:row.completed==='true'}));
   }catch(error){
    center.readTickets.get(turn)?.delete(ticket);
    center.receiveAppletEvent({provider,callId:ticket,phase:'error'},turn);
    throw error;
   }
  }
  return result;
 }
 if(name==='_source_result'){
  const provider=args.provider,ticket=args.ticket;
  if(typeof provider!=='string'||typeof ticket!=='string'||center.readTickets.get(turn)?.get(ticket)!==provider||!center.connected(provider))throw new WorldletError('Source permission or read receipt is no longer valid.');
  if(args.failed===true){
   center.readFailures.add(turn);
   center.readTickets.get(turn)?.delete(ticket);
   center.receiveAppletEvent({provider,callId:ticket,phase:'error'},turn);
   return {ok:true};
  }
  const records=args.records;
  if(!Array.isArray(records)||records.length>50)throw new WorldletError('Invalid source receipt.');
  const evidence={...(store.worldEvidence[turn]??{})};
  for(const row of records){
   if(!isRow(row)||row.provider!==provider||typeof row.id!=='string'||!row.id||!withinCharacters(row.id,500)||typeof row.text!=='string'||!withinCharacters(row.text,12000))throw new WorldletError('Invalid source evidence.');
   if(row.metadataOnly!==true)evidence[provider+':'+row.id]=row;
  }
  if(monitorProvider!==undefined)db.withRuntimeOutput('applet:'+provider+':check',turn,()=>center.observeAttention(provider,records));
  else center.observeAttention(provider,records);
  store.worldEvidence[turn]=evidence;center.readTickets.get(turn)?.delete(ticket);
  center.receiveAppletEvent({provider,callId:ticket,phase:'complete',count:records.length},turn);
  return {ok:true};
 }
 if(name==='upsert_world_items')return upsertWorldItems(center,args,turn,monitorProvider);
 if(name==='review_world_item'){
  const id=args.id,assessment=args.assessment,reason=args.reason,refs=args.sources;
  const previous=typeof id==='string'?db.records('items').find(item=>item.id===id):undefined;
  if(typeof id!=='string'||typeof assessment!=='string'||typeof reason!=='string'||!previous||monitorProvider!==undefined&&previous.provider!==monitorProvider||!Array.isArray(refs)||!refs.length||refs.length>8)throw new WorldletError('Invalid item review.');
  const evidence:Row[]=[];
  for(const ref of refs){
   const p=ref?.provider,source=ref?.id,quote=ref?.quote;
   const read=typeof p==='string'&&typeof source==='string'?store.worldEvidence[turn]?.[p+':'+source]:undefined;
   if(typeof p!=='string'||typeof source!=='string'||typeof quote!=='string'||!quote||!withinCharacters(quote,1000)||!center.attentionSourceAuthorized(p,turn)||!read||typeof read.text!=='string'||!read.text.includes(quote))throw new WorldletError('Review evidence was not read in this turn.');
   evidence.push({provider:p,id:source,quote,url:read.url??''});
  }
  const snapshot=center.synthesisFacts.get(turn);
  let managed:Row|undefined;
  if(snapshot)center.attentionManaged({sources:evidence},snapshot,'synthesis');
  if(snapshot&&assessment==='actionable')managed=center.attentionManaged(previous,snapshot,'synthesis');
  const saveReview=()=>{
   db.review(id,assessment,reason,evidence,turn);
   if(managed){const reviewed=db.find('items',id);if(reviewed){reviewed.attentionDependencies=managed.attentionDependencies;db.put('items',id,reviewed);}}
   const reviewed=db.find('items',id);
   if(reviewed)db.put('items',id,center.calendarTimes(reviewed,store.worldEvidence[turn]??{}));
  };
  if(snapshot)db.withRuntimeOutput('attention:center',turn,()=>{center.requireAttentionWritable();saveReview();});
  else db.transaction(saveReview);
  center.worldChanged();
  return {ok:true,persisted:true};
 }
 if(monitorProvider!==undefined)throw new WorldletError('Scheduled checks cannot change user status or schedules.');
 if(name==='update_world_item'){
  if(typeof args.id!=='string'||typeof args.status!=='string')throw new WorldletError('Missing item status.');
  db.update(args.id,args.status);center.worldChanged();return {ok:true};
 }
 if(name==='archive_world_items'){
  if(!Array.isArray(args.ids)||!args.ids.every(id=>typeof id==='string'))throw new WorldletError('Missing item IDs.');
  const count=db.archive(args.ids);center.worldChanged();
  return {ok:true,archived:count,restorable:true};
 }
 if(name==='read_companion_archive')return center.readCompanionArchive(args);
 if(name==='read_world_history')return db.queryWorldHistory(args);
 if(name==='configure_world_check')return store.configureWorldCheck(args,provider=>center.cancelProvider(provider));
 throw new WorldletError('Unknown world operation.');
}

const RACES=[CONTEXT_CHANGED,SOURCE_PAUSED];
async function upsertWorldItems(center:AttentionCenter,args:Row,turn:string,monitorProvider?:string):Promise<Row> {
 const store=center.store,db=store.ledger();
 const items=args.items;
 if(!Array.isArray(items)||!store.worldEvidence[turn])throw new WorldletError('Read sources in this turn before saving findings.');
 const evidence=store.worldEvidence[turn];
 const validated:Row[]=[],rejected:Row[]=[];
 const analysis=center.analysisProviders.has(turn),snapshot=center.synthesisFacts.get(turn);
 // Background batches accept each valid finding independently: one bad record must not
 // discard its verified siblings. Its cited inputs stay pending instead.
 const partial=analysis||snapshot!==undefined;
 const reject=(index:number,item:Row,error:unknown)=>{
  if(!partial)throw error;
  rejected.push({index,error:message(error),sources:rows(item?.sources).map(ref=>({provider:ref.provider??'',id:ref.id??''}))});
 };
 // Nothing in this loop writes the Applet registry or the attention context.
 const providers=center.checkProviders(),facts=db.attentionFacts();
 const current={facts,paused:snapshot?center.pausedProviders():[]};
 let saved:Row[]|undefined;const savedItems=()=>saved??=db.records('items');
 const canonicalItems=core('canonicalSourceQuotes',{items,evidence});
 if(!Array.isArray(canonicalItems))throw new WorldletError('Invalid source quotes.');
 for(const [index,original] of canonicalItems.entries()){
  try{
   // Calendar times are the provider's facts: project them before content rules check them, so a model-written
   // start or end on a Calendar event never rejects it (#1609).
   let item=core(analysis?'appletCandidateContent':'attentionContent',{item:isRow(original)?center.calendarTimes(original,evidence):original});
   if(!isRow(item))throw new WorldletError('Attention needs model-written title, reason and summary.');
   const refs=item.sources;
   if(typeof item.provider!=='string'||!Array.isArray(refs)||core('attentionOwnerAllowed',{provider:item.provider,sources:refs,scheduled:providers,facts:snapshot??[],monitorProvider:monitorProvider??''})!==true)throw new WorldletError('Invalid item ownership.');
   const canonical:Row[]=[],websiteURLs=new Set<string>();
   for(const ref of refs){
    const p=ref?.provider,id=ref?.id,quote=ref?.quote;
    const read=typeof p==='string'&&typeof id==='string'?evidence[p+':'+id]:undefined;
    if(typeof p!=='string'||typeof id!=='string'||typeof quote!=='string'||!quote||!center.attentionSourceAuthorized(p,turn)||!read||typeof read.text!=='string'||!read.text.includes(quote))throw new WorldletError(UNVERIFIED);
    // The email's own picture travels with its reference, for the card (core/attention/source-image.ts).
    const image=attentionImageURL(read.image);
    canonical.push({provider:p,id,quote,url:read.url??'',...(image?{image}:{})});
    // Preserve destinations from verified source text, never model-invented links.
    for(const link of httpsLinks(read.text))websiteURLs.add(link);
   }
   item.sources=canonical;item.websiteURLs=[...websiteURLs].sort();
   for(const key of ['attentionDependencies','attentionMode','attentionKey','attentionInvalidated'])delete item[key];
   if(analysis){
    // Source candidates are not Center items.
   }else if(snapshot){
    if(core('attentionSuppressed',{item,items:savedItems()})===true)continue;
    item=center.attentionManaged(item,snapshot,'synthesis',current);
    // Shared context alone must not inherit another matter's status.
    if(item.id==null){const previousID=core('attentionMatchingID',{item,items:savedItems()});if(typeof previousID==='string')item.id=previousID;}
   }else if(canonical.every(ref=>facts.some(f=>f.provider===ref.provider&&f.sourceId===ref.id))){
    item=center.attentionManaged(item,facts,'source',current);
   }
   validated.push(center.calendarTimes(item,evidence));
  }catch(error){
   if(!isValidation(error))throw error;
   reject(index,original,error);
  }
 }
 // With nothing accepted, keep the strict error so the single repair sees evidence issues. Input that changed or was
 // paused during the run is not a model error a repair can fix: its sources stay pending for the next pass (#1609).
 // Report the first rejection a repair can fix, not a race that happened to come first.
 const strict=rejected.find(row=>!RACES.includes(String(row.error)));
 if(!validated.length&&typeof strict?.error==='string')throw new WorldletError(strict.error);
 if(analysis){
  const merged=core('mergeAnalysisCandidates',{previous:center.analysisCandidates.get(turn)??[],incoming:validated});
  if(!Array.isArray(merged))throw new WorldletError('Invalid candidate merge.');
  center.analysisCandidates.set(turn,merged);
  const records=Object.values(evidence).map(row=>({id:row.id??'',provider:row.provider??'',sourceId:row.id??''}));
  const withheld=strings(core('withheldContextIds',{context:records,rejected}));
  return {ok:true,staged:validated.length,published:false,rejected,withheldContextIds:withheld};
 }
 let result:Row;
 if(snapshot){
  result=db.withRuntimeOutput('attention:center',turn,()=>{
   center.requireAttentionWritable();
   // Each finding saves under its own savepoint. Receipts are revision-exact, so input that
   // changed during the run stays pending for the next pass.
   const ids:unknown[]=[],reviews:unknown[]=[];
   for(const item of validated){
    try{const saved=db.transaction(()=>db.saveTaskProposals([item],turn));ids.push(...(saved.ids??[]));reviews.push(...(saved.taskReviews??[]));}
    catch(error){if(!isValidation(error))throw error;reject(-1,item,error);}
   }
   const withheld=strings(core('withheldContextIds',{context:snapshot,rejected}));
   const coverage=core('attentionCoverage',{available:snapshot.map(f=>f.id).filter(id=>typeof id==='string'),required:[],previous:[],processed:args.processedContextIds??[],withheld});
   const processed=new Set(strings(coverage?.processed));
   db.acknowledgeAttentionDeliveries(snapshot.filter(f=>processed.has(typeof f.id==='string'?f.id:'')).map(f=>({id:f.id,revision:f.revision})));
   const plan=center.synthesisPlans.get(turn);
   if(processed.size&&plan)db.replaceAttentionCache('attention-budget',core('attentionProgress',{budget:db.attentionBudget(),plan,processed:[...processed],facts:db.attentionFacts()}));
   return {ok:true,ids,persisted:true,taskReviews:reviews,requiresReview:reviews.length>0,withheldContextIds:withheld,
    guidance:reviews.length?"Changed tasks await the user's choice in Fox. Do not claim they were updated or create a duplicate to bypass review.":'Findings saved.'};
  });
 }else result=db.saveTaskProposals(validated,turn);
 if(rejected.length)result.rejected=rejected;
 center.acknowledged.add(turn);center.worldChanged();
 return result;
}
