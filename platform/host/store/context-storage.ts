import type {ContextChange,ContextDomainId,ContextDomainStore,ContextStorage} from '../../../context/store/index.ts';
import {SERVICE_SYNC_BUCKETS} from '../../../contracts/service-sync.ts';
import type {WorldLedger} from './ledger.ts';

type Row=Record<string,any>;
const SNAPSHOTS=SERVICE_SYNC_BUCKETS[2];
/** Any part of the World's ledger: host modules and their checks hand over the slice they were given. */
export type ContextLedger=Partial<WorldLedger>;

// The host's side of the one way in to Context (#676, context/store/context.ts): each domain the World keeps, read and
// written exactly as before, in the same tables and the same shapes. Nothing here decides who may write: the entry does.
// A domain is offered only when the ledger given has what it needs, so a check's small fake ledger works the same.
const has=<K extends keyof WorldLedger>(ledger:ContextLedger,...names:K[])=>names.every(name=>typeof ledger[name]==='function');
const forget=(change:ContextChange)=>change.forget??[];

export function ledgerContext(ledger:ContextLedger):ContextStorage {
 const domains:Partial<Record<ContextDomainId,ContextDomainStore>>={};
 const l=ledger as WorldLedger;
 // A state bucket: its rows, and one by its key without reading the others (a snapshot can be large).
 const bucket=(name:string):ContextDomainStore=>({rows:()=>l.records(name),get:key=>has(ledger,'value')?l.value(name,key):l.records(name).find(row=>row.id===key)??null});
 if(has(ledger,'artifactRows'))domains.artifacts={rows:()=>l.artifactRows(),
  ...has(ledger,'saveArtifacts')?{write:change=>l.saveArtifacts(change.save??[],forget(change))}:{}};
 if(has(ledger,'artifactPage','artifactPageIds'))domains['artifact-pages']={rows:()=>l.artifactPageIds().flatMap(id=>{const page=l.artifactPage(id);return page?[page]:[];}),get:id=>l.artifactPage(id),
  ...has(ledger,'saveArtifactPage','deleteArtifactPages')?{write:change=>{for(const page of change.save??[])l.saveArtifactPage(page);l.deleteArtifactPages(forget(change));}}:{}};
 else if(has(ledger,'deleteArtifactPages'))domains['artifact-pages']={write:change=>l.deleteArtifactPages(forget(change))};
 if(has(ledger,'widgetRows','saveWidget','deleteWidget'))domains.widgets={rows:()=>l.widgetRows().map(row=>row.record),
  // A page's record, with its page and state when the change carries them (`with`: {id, html, state}).
  write:change=>{const {id,html,state}=change.with??{};for(const record of change.save??[])l.saveWidget(String(id??record.id),record,{html,state});for(const id of forget(change))l.deleteWidget(id);}};
 if(has(ledger,'madeGameRecords','saveMadeGame','deleteMadeGame'))domains['made-games']={rows:()=>l.madeGameRecords(),
  // A game's record, with its page and how many earlier pages to keep when the change carries them (`with`: {id, html, versions}).
  write:change=>{for(const record of change.save??[])l.saveMadeGame(String(change.with?.id??record.id),record,change.with?.html,change.with?.versions);for(const id of forget(change))l.deleteMadeGame(id);}};
 if(has(ledger,'ongoingRows','saveOngoing'))domains.ongoing={rows:()=>l.ongoingRows(),write:change=>l.saveOngoing(change.save??[],forget(change))};
 if(has(ledger,'calendarEventRows','saveCalendarEvents'))domains['calendar-events']={rows:()=>l.calendarEventRows(),write:change=>l.saveCalendarEvents(change.save??[],forget(change))};
 if(has(ledger,'agentReports'))domains['agent-reports']={rows:()=>l.agentReports(),
  ...has(ledger,'saveAgentReport')?{write:change=>{for(const report of change.save??[])l.saveAgentReport(report);}}:{}};
 if(has(ledger,'board'))domains.board={rows:()=>{const board=l.board();return board?[board]:[];},
  ...has(ledger,'saveBoard')?{write:change=>{for(const board of change.save??[])l.saveBoard(board);}}:{}};
 if(has(ledger,'servicePresets'))domains['service-presets']={rows:()=>l.servicePresets(),
  ...has(ledger,'saveServicePreset','deleteServicePreset')?{write:change=>{for(const preset of change.save??[])l.saveServicePreset(preset);for(const id of forget(change))l.deleteServicePreset(id);}}:{}};
 if(has(ledger,'agentAsks'))domains['agent-asks']={rows:()=>l.agentAsks()};
 if(has(ledger,'githubDrafts'))domains['github-drafts']={rows:()=>l.githubDrafts()};
 if(has(ledger,'serviceDrafts'))domains['service-drafts']={rows:()=>l.serviceDrafts()};
 if(has(ledger,'serviceRequests'))domains['service-requests']={rows:()=>l.serviceRequests()};
 if(has(ledger,'mailReviews'))domains['mail-reviews']={rows:()=>Object.entries(l.mailReviews()).map(([id,review])=>({id,...review}))};
 if(has(ledger,'codingTasks'))domains['coding-tasks']={rows:()=>l.codingTasks().map(task=>task.record)};
 if(has(ledger,'records')){
  domains['attention-items']=bucket('items');
  domains['attention-reviews']=bucket('reviews');
  domains['source-facts']={rows:()=>has(ledger,'attentionFacts')?l.attentionFacts():[]};
  // A finished snapshot replaces the one before it (the sync loop's own fence decides whether it may).
  domains['service-sync']={...bucket(SNAPSHOTS),...has(ledger,'put','delete')?{write:change=>{
   for(const snapshot of change.save??[]){l.delete(SNAPSHOTS,String(snapshot.id));l.put(SNAPSHOTS,String(snapshot.id),snapshot);}
   for(const id of forget(change))l.delete(SNAPSHOTS,id);
  }}:{}};
 }
 // Domains with their own index: searched there, never listed whole.
 if(has(ledger,'searchCompanion'))domains.conversations={search:(terms,limit)=>{
  const longest=[...terms].sort((a,b)=>b.length-a.length)[0]??'';
  return l.searchCompanion(longest,0,limit*4).rows.filter(row=>terms.every(term=>String(row.text??'').toLowerCase().includes(term))).slice(0,limit);
 }};
 if(has(ledger,'webVisits'))domains['web-recordings']={search:(terms,limit)=>l.webVisits({terms,before:Date.now()/1000+86_400,limit}).visits};
 return {domains,...has(ledger,'transaction')?{transaction:<T>(work:()=>T):T=>l.transaction(work)}:{}};
}
