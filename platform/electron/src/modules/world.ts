import {WorldletError} from '../files.ts';
import type {Host} from '../host/types.ts';
import {SOURCES,WORLD_TOOLS} from '../host/services.ts';
import type {SourcesService,WorldToolsService} from '../host/services.ts';
import {WORLD_LOG_KINDS,worldLogKeeps} from '../../../../core/activity/index.ts';
import {CONVERSATION_ATTENTION,callOriginal,conversationAttentionId,conversationOriginal,externalEventOriginal,validCallAttentionId,validConversationAttentionId,validExternalEventAttentionId} from '../../../../core/ongoing/index.ts';
// The World library itself: snapshot, presentation, items, history and onboarding.
export function installWorld(host:Host){
 const {store}=host;
 const sample=()=>store.sampleEnabled();
 host.register({
  snapshot:()=>store.snapshot(),
  saveOverlay:request=>{store.savePresentation(request);return {ok:true};},
  saveSampleUI:request=>{store.savePresentation(request);return {ok:true};},
  setTextScale:request=>{store.savePresentation(request);return {ok:true};},
  worldActivity:request=>{store.recordActivity(request);return {ok:true};},
  uiCommand:()=>({ok:true}),
  worldHistory:request=>store.worldHistory(typeof request.before==='number'?request.before:undefined,typeof request.after==='number'?request.after:undefined),
  // The bottom-right world log. Raw rows only; Core writes the lines. Scheduled checks are
  // asked for separately because their report reads several tables.
  worldLog:request=>{
   if(sample())return {entries:[],tasks:[],sample:true};
   const tools=request.tasks===true?host.optional<WorldToolsService>(WORLD_TOOLS):undefined;
   // Host actions are recorded as `world.action` on every call; read them apart and keep only the
   // ones that make a line, or a busy minute of them leaves the log empty and hidden.
   const ledger=store.ledger(),rest=WORLD_LOG_KINDS.filter(kind=>kind!=='world.action');
   const entries=[...ledger.history({kinds:rest,limit:80}),...ledger.history({kind:'world.action',limit:400}).filter(worldLogKeeps)].sort((a,b)=>Number(b.seq)-Number(a.seq)).slice(0,80);
   return {entries,...(tools?{tasks:tools.runtimeTaskReport().rows??[]}:{})};
  },
  worldItemRead:request=>{if(typeof request.id!=='string')throw new WorldletError('Missing item ID.');store.markWorldItemRead(request.id);return {ok:true};},
  worldItemStatus:request=>{if(typeof request.id!=='string')throw new WorldletError('Missing item ID.');store.setWorldItemStatus(request.id,String(request.status??''),typeof request.snoozedUntil==='string'?request.snoozedUntil:null,request.by==='fox'?'fox':undefined);return {ok:true};},
  taskReviewAction:request=>store.reviewTask(String(request.id??''),String(request.choice??''),typeof request.candidateId==='string'?request.candidateId:undefined),
  setSampleEnabled:request=>{
   if(typeof request.enabled!=='boolean')throw new WorldletError('Invalid practice setting.');
   host.preferences.set('worldlet.sampleEnabled',request.enabled);store.changed();return {ok:true};
  },
  original:request=>{
   if(sample())throw new WorldletError('Personal originals are unavailable in the practice world.');
   if(typeof request.id!=='string')throw new WorldletError('Missing source ID.');
   if(request.id.startsWith('world-item:')){
    const sources=host.optional<SourcesService>(SOURCES);
    if(!sources)throw new WorldletError('Saved item originals are unavailable in this build.');
    return sources.itemOriginal(request.id.slice(11));
   }
   // An Attention item found in a brought conversation opens back to it (core/ongoing/attention.ts).
   if(request.id.startsWith('conversation:')){
    const id=request.id.slice(13),ledger=store.ledger();
    // One found in an outside event that started the person's Agent opens what it was asked and answered (core/ongoing/external-events.ts).
    if(validExternalEventAttentionId(id)){
     const record=(ledger.find('applet-observations','conversations')?.records??[]).find((row:any)=>row?.id===id);
     if(!record)throw new WorldletError('That event is no longer in this world.');
     return externalEventOriginal(record);
    }
    // One found in a phone call through the person's Agent opens the call: who, when, how it went and its transcript (core/ongoing/harness-calls.ts).
    if(validCallAttentionId(id)){
     const record=(ledger.find('applet-observations','conversations')?.records??[]).find((row:any)=>row?.id===id);
     if(!record)throw new WorldletError('That call is no longer in this world.');
     return callOriginal(record);
    }
    const c=validConversationAttentionId(id)?ledger.broughtConversations().find(row=>conversationAttentionId(row.source,row.session)===id):undefined;
    if(!c)throw new WorldletError('That conversation is no longer in this world.');
    return conversationOriginal(c,ledger.conversationTurns(c.source,c.session,CONVERSATION_ATTENTION.originalTurns));
   }
   const original=store.original(request.id);
   return {title:original.title,text:original.text,sourceURL:store.state.sources.find(s=>s.id===request.id)?.sourceURL,mail:{}};
  }
 });
}
