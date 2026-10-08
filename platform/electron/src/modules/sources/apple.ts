import {WorldletError} from '../../files.ts';
import {referenceDate} from '../../store/world-store.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
// macOS Calendar, Reminders and Notes (Mac AppleSources.swift, HomeAppletWrites.swift).
// EventKit has no command-line tool, so a bounded JavaScript-for-Automation helper uses
// EventKit through the Objective-C bridge with the same identifiers the Mac host stored.
// Permission prompts are attributed to Worldlet as the responsible process. No user text
// becomes executable code: requests travel on stdin as JSON.

// Keep the Calendar Applet's existing provider ID so saved items and links survive.
export const APPLE_PROVIDERS=['google-calendar','apple-notes','apple-reminders'];
const OSASCRIPT='/usr/bin/osascript';

const PRELUDE=String.raw`
ObjC.import('Foundation');ObjC.import('EventKit');
const input=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile,$.NSUTF8StringEncoding)));
const yes=v=>v===true||v==1;
const none=v=>v===undefined||v===null||(typeof v.isNil==='function'&&v.isNil());
const text=v=>{if(none(v))return '';const s=ObjC.unwrap(v);return typeof s==='string'?s:'';};
const seconds=d=>none(d)?null:Number(d.timeIntervalSince1970);
const wait=state=>{const end=Date.now()+40000;while(!state.done&&Date.now()<end)$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));if(!state.done)throw Error('EventKit did not answer.');};
const access=type=>Number($.EKEventStore.authorizationStatusForEntityType(type));
// JXA never runs EventKit's (BOOL, NSError) request completion, so the answer is read back from TCC.
// A changed or full-access status is the decision; denied and restricted cannot prompt again.
const request=(store,type)=>{
 const before=access(type);if(before===1||before===2)return before;
 if(type===0)store.requestFullAccessToEventsWithCompletion(()=>{});else store.requestFullAccessToRemindersWithCompletion(()=>{});
 const end=Date.now()+40000;
 while(Date.now()<end){$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25));const now=access(type);if(now===3||now!==before)return now;}
 return access(type);
};
class Refusal{constructor(message){this.message=message;}}
const fail=message=>{throw new Refusal(message);};
const answer=work=>{try{return JSON.stringify(work());}catch(error){return JSON.stringify(error instanceof Refusal?{error:error.message}:{failure:String(error)});}};
`;

const READ=PRELUDE+String.raw`
answer(()=>{
 const type=input.provider==='google-calendar'?0:1,store=$.EKEventStore.alloc.init;
 if(input.authorize&&access(type)!==3){
  const decided=request(store,type);
  if(decided===0)return {status:'unavailable'};
  if(decided!==3)return {status:'denied'};
 }
 if(access(type)!==3)return {status:'unavailable'};
 const calendar=$.NSCalendar.currentCalendar,rows=[];
 if(type===0){
  const start=calendar.startOfDayForDate($.NSDate.date),end=calendar.dateByAddingUnitValueToDateOptions(16,30,start,0);
  const list=store.eventsMatchingPredicate(store.predicateForEventsWithStartDateEndDateCalendars(start,end,$()));
  for(let i=0;i<Number(list.count);i++){
   const e=list.objectAtIndex(i),status=Number(e.status);
   if(!input.includeCancelled&&status===3)continue;
   let declined=false;const people=e.attendees;
   if(!none(people))for(let j=0;j<Number(people.count);j++){const p=people.objectAtIndex(j);if(yes(p.isCurrentUser)&&Number(p.participantStatus)===3)declined=true;}
   const recurring=yes(e.hasRecurrenceRules)||yes(e.isDetached);
   rows.push({key:text(e.calendarItemIdentifier),start:seconds(e.startDate),end:seconds(e.endDate),occurrence:recurring?seconds(e.occurrenceDate):null,recurring,cancelled:status===3,declined,allDay:yes(e.isAllDay),title:none(e.title)?null:text(e.title),calendar:text(e.calendar.title),url:none(e.URL)?'':text(e.URL.absoluteString),notes:text(e.notes),location:text(e.location)});
  }
  rows.sort((a,b)=>a.start-b.start);
  return {records:rows.slice(0,50)};
 }
 const state={};
 store.fetchRemindersMatchingPredicateCompletion(store.predicateForRemindersInCalendars($()),values=>{state.values=values;state.done=true;});
 wait(state);
 if(none(state.values))fail('Reminders could not be read.');
 for(let i=0;i<Number(state.values.count);i++){
  const r=state.values.objectAtIndex(i),due=r.dueDateComponents;
  rows.push({id:text(r.calendarItemIdentifier),title:none(r.title)?null:text(r.title),list:text(r.calendar.title),due:none(due)?null:seconds(calendar.dateFromComponents(due)),completed:yes(r.isCompleted),notes:text(r.notes),modified:seconds(r.lastModifiedDate)});
 }
 rows.sort((a,b)=>(b.modified??-1e12)-(a.modified??-1e12));
 return {records:rows.slice(0,50)};
});
`;

const NOTES=String.raw`
const app = Application('Notes');
const notes = app.notes();
const result = [];
let skipped = 0;
for (let i = 0; i < Math.min(notes.length, 50); i++) {
  const note = notes[i];
  try {
    if (note.passwordProtected()) { skipped++; continue; }
    const text = note.plaintext().slice(0,50000);
    if (!text.trim()) { continue; }
    result.push({id:note.id(), title:note.name(), text:text});
  } catch (_) { skipped++; }
}
JSON.stringify({records:result, skipped:skipped});
`;

/** Reviewed Calendar/Reminders writes: prepare reads facts, commit re-checks them first. */
const WRITE=PRELUDE+String.raw`
answer(()=>{
 const plan=input.plan,provider=plan.provider,operation=plan.operation,type=provider==='google-calendar'?0:1;
 if(access(type)!==3)fail('Reconnect this Applet to review system access.');
 const db=$.EKEventStore.alloc.init,optional=v=>typeof v==='string'?v:$();
 const date=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(s)||!isFinite(Date.parse(s)))fail('Invalid date.');return $.NSDate.dateWithTimeIntervalSince1970(Date.parse(s)/1000);};
 const event=id=>{
  const split=typeof id==='string'?id.lastIndexOf('@'):-1;
  if(typeof id!=='string'||!id.startsWith('eventkit:')||split<0)fail('Read this event again first.');
  const key=id.slice(9,split),start=date(id.slice(split+1)),at=Number(start.timeIntervalSince1970);
  const list=db.eventsMatchingPredicate(db.predicateForEventsWithStartDateEndDateCalendars(start.dateByAddingTimeInterval(-1),start.dateByAddingTimeInterval(1),$()));
  let found=null;
  for(let i=0;i<Number(list.count);i++){const e=list.objectAtIndex(i);if(text(e.calendarItemIdentifier)===key&&Math.abs(seconds(e.startDate)-at)<1){found=e;break;}}
  if(!found)fail('This event changed or is unavailable. Read it again.');
  const people=found.attendees;
  if(yes(found.hasRecurrenceRules)||yes(found.isDetached)||yes(found.isAllDay)||!none(people)&&Number(people.count)>0)fail('Use Calendar for recurring, all-day or invited events. This action supports ordinary timed events only.');
  return found;
 };
 const reminder=id=>{const r=db.calendarItemWithIdentifier(String(id??''));return none(r)||!yes(r.isKindOfClass($.EKReminder))?null:r;};
 const prepare=()=>{
  let item=null;
  if(operation==='create')item=null;
  else if(provider==='google-calendar')item=event(plan.id);
  else{item=reminder(plan.id);if(!item)fail('This reminder is unavailable. Read it again.');if(yes(item.hasRecurrenceRules))fail('Use Reminders to change a repeating reminder.');}
  const calendar=item?item.calendar:provider==='google-calendar'?db.defaultCalendarForNewEvents:db.defaultCalendarForNewReminders;
  if(none(calendar)||!yes(calendar.allowsContentModifications))fail('Choose a writable default calendar or reminder list in the system app.');
  return {calendarID:text(calendar.calendarIdentifier),destination:text(calendar.title),targetTitle:item&&!none(item.title)?text(item.title):typeof plan.title==='string'?plan.title:'',revision:item?seconds(item.lastModifiedDate)??0:0};
 };
 if(input.mode==='prepare')return prepare();
 const facts=input.facts,calendar=db.calendarWithIdentifier(String(facts.calendarID??''));
 if(none(calendar)||!yes(calendar.allowsContentModifications))fail('The reviewed destination is no longer writable.');
 const fresh=prepare();
 if(fresh.calendarID!==facts.calendarID||fresh.revision!==facts.revision)fail('The item or destination changed after review. Read it again and prepare a new change.');
 if(provider==='google-calendar'){
  const value=operation==='create'?$.EKEvent.eventWithEventStore(db):event(plan.id);
  if(operation==='create'){value.setCalendar(calendar);value.setTitle(optional(plan.title));value.setNotes(optional(plan.text));}
  value.setStartDate(date(plan.start));value.setEndDate(date(plan.end));
  if(!yes(db.saveEventSpanCommitError(value,0,true,null)))fail('Calendar could not save this change.');
  const identifier=value.eventIdentifier,read=none(identifier)?null:db.eventWithIdentifier(identifier);
  if(none(read)||seconds(read.startDate)!==seconds(value.startDate)||seconds(read.endDate)!==seconds(value.endDate)||text(read.title)!==text(value.title))fail('Calendar saved the request, but its result could not be verified. Check Calendar before trying again.');
  return {status:'verified',id:text(read.calendarItemIdentifier),title:text(read.title)};
 }
 let value;
 if(operation==='create'){value=$.EKReminder.reminderWithEventStore(db);value.setCalendar(calendar);value.setTitle(optional(plan.title));value.setNotes(optional(plan.text));}
 else{value=reminder(plan.id);if(!value)fail('Reminder unavailable.');}
 if(operation==='complete')value.setCompleted(true);
 if(typeof plan.due==='string'){const current=$.NSCalendar.currentCalendar,parts=current.componentsFromDate(4|8|16|32|64|128,date(plan.due));parts.setTimeZone(current.timeZone);value.setDueDateComponents(parts);}
 if(!yes(db.saveReminderCommitError(value,true,null)))fail('Reminders could not save this change.');
 const read=reminder(value.calendarItemIdentifier);
 const same=(a,b)=>none(a)?none(b):!none(b)&&yes(a.isEqual(b));
 if(!read||text(read.title)!==text(value.title)||yes(read.isCompleted)!==yes(value.isCompleted)||!same(read.dueDateComponents,value.dueDateComponents))fail('The reminder result is unconfirmed. Check Reminders before trying again.');
 return {status:'verified',id:text(read.calendarItemIdentifier),title:text(read.title)};
});
`;

/** The Mac host's Notes review/write script, unchanged. */
const NOTES_WRITE=String.raw`
ObjC.import('Foundation');
const data=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
const q=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data,$.NSUTF8StringEncoding)));
const app=Application('Notes');
const escape=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/\n/g,'<br>');
let folder,note;
if(q.operation==='create'){
  folder=q.folderID?app.folders.byId(q.folderID):app.defaultAccount().defaultFolder();
  if(!folder.exists())throw Error('Choose a default Notes folder first.');
}else{
  note=app.notes.byId(q.id);
  if(!note.exists()||note.passwordProtected())throw Error('The note is unavailable or locked.');
  if(note.shared()||note.attachments().length)throw Error('Use Notes to edit shared notes or notes with attachments.');
  folder=note.container();
}
if(!q.commit){
  JSON.stringify({destination:folder.name(),targetTitle:note?note.name():q.title,folderID:folder.id(),originalBody:note?note.body():''});
}else{
  if(note&&note.body()!==q.originalBody)throw Error('The note changed after review. Read it again.');
  if(q.operation==='create')note=app.make({new:'note',at:folder,withProperties:{body:'<h1>'+escape(q.title)+'</h1><div>'+escape(q.text)+'</div>'}});
  else note.body=q.originalBody+'<div><br></div><div>'+escape(q.text)+'</div>';
  const plain=note.plaintext();
  if(q.text&&!plain.includes(q.text))throw Error('The write was attempted but needs checking in Notes.');
  JSON.stringify({status:'verified',id:note.id(),title:note.name()});
}
`;

function requireMac(){if(process.platform!=='darwin')throw new WorldletError('This local app is available only on macOS.');}
async function eventKit(ctx:SourcesContext,script:string,input:Row,unavailable:string):Promise<Row> {
 const run=await ctx.run(OSASCRIPT,['-l','JavaScript','-e',script],{input:JSON.stringify(input)});
 let value:Row;try{value=JSON.parse(run.stdout);}catch{throw new WorldletError(unavailable);}
 if(typeof value?.error==='string')throw new WorldletError(value.error);
 if(run.code!==0||value?.failure)throw new WorldletError(unavailable);
 return value;
}
const iso=(seconds:number)=>new Date(Math.floor(seconds)*1000).toISOString().replace(/\.\d{3}Z$/,'Z');
const localDay=(seconds:number)=>{const date=new Date(seconds*1000);return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

/** Read-only adapters. Permissions are requested only from an explicit Connect action. */
export async function readApple(ctx:SourcesContext,provider:string,authorize:boolean,includeCancelled=false):Promise<Record<string,string>[]> {
 if(!APPLE_PROVIDERS.includes(provider))throw new WorldletError('Unsupported local app.');
 requireMac();
 if(provider==='google-calendar'){
  const value=await eventKit(ctx,READ,{provider,authorize,includeCancelled},'Calendar access is unavailable. Connect Calendar to review system permission.');
  if(value.status==='denied')throw new WorldletError('Calendar access was not granted. Allow Worldlet in System Settings → Privacy & Security → Calendars, then retry.');
  if(value.status==='unavailable')throw new WorldletError('Calendar access is unavailable. Connect Calendar to review system permission.');
  return (value.records as Row[]).map(event=>{
   const startText=event.allDay?localDay(event.start):iso(event.start),endText=event.allDay?localDay(event.end):iso(event.end);
   const title=event.title??'Event';
   return {id:'eventkit:'+event.key+'@'+iso(event.start),attentionId:event.key+(event.recurring&&event.occurrence!=null?'@'+iso(event.occurrence):''),
    cancelled:event.cancelled?'true':'false',declined:event.declined?'true':'false',title,start:startText,end:endText,allDay:event.allDay?'true':'false',list:event.calendar,
    url:event.url,description:event.notes,location:event.location,
    text:`Calendar: ${event.calendar}\nStart: ${startText}\nEnd: ${endText}\nLocation: ${event.location}\n${event.url}\n${event.notes}`};
  });
 }
 if(provider==='apple-reminders'){
  const value=await eventKit(ctx,READ,{provider,authorize},'Reminders access is unavailable. Reconnect to review system permission.');
  if(value.status==='denied')throw new WorldletError('Reminders access was not granted. Allow Worldlet in System Settings to retry.');
  if(value.status==='unavailable')throw new WorldletError('Reminders access is unavailable. Reconnect to review system permission.');
  return (value.records as Row[]).map(reminder=>{
   const due=reminder.due==null?'':iso(reminder.due);
   return {id:reminder.id,title:reminder.title??'Reminder',list:reminder.list,due,completed:reminder.completed?'true':'false',text:`List: ${reminder.list}\nStatus: ${reminder.completed?'Completed':'Incomplete'}\nDue: ${due}\n${reminder.notes}`};
  });
 }
 // macOS attributes this Apple Events request to Worldlet, with its own usage description.
 const run=await ctx.run(OSASCRIPT,['-l','JavaScript','-e',NOTES]).catch(error=>{if(error instanceof WorldletError)throw new WorldletError('Notes response is too large.');throw error;});
 if(run.code!==0)throw new WorldletError('Notes could not be read. Allow Worldlet to access Notes in System Settings → Privacy & Security → Automation, then retry.');
 let value:Row;try{value=JSON.parse(run.stdout);}catch{throw new WorldletError('Notes returned an unsupported response.');}
 const records=value?.records;
 if(!Array.isArray(records)||!records.every(row=>row&&typeof row==='object'&&Object.values(row).every(v=>typeof v==='string')))throw new WorldletError('Notes returned an unsupported response.');
 if(!records.length&&Number(value.skipped??0)>0)throw new WorldletError('The selected notes are locked or unreadable. Unlock a note in Notes and retry.');
 return records;
}

export async function connectApple(ctx:SourcesContext,provider:string,region?:string){
 const {store}=ctx;
 if(!store.writable||store.busy||!APPLE_PROVIDERS.includes(provider))throw new WorldletError('Wait for the current task to finish.');
 if(store.sampleEnabled())throw new WorldletError('Open your personal world to connect local apps.');
 store.status=`Reading ${provider}…`;
 await ctx.busyWhile(async()=>{
  ctx.requireRegion(region);
  const records=await readApple(ctx,provider,true);
  const connection:Row={id:'local-'+provider,provider,target:provider==='google-calendar'?'Calendars on this Mac':provider==='apple-notes'?'Apple Notes':'Apple Reminders',transport:'native',syncStatus:'connected',connector:'system'};
  const previous=structuredClone(store.state);
  try{
   store.state.connections=store.state.connections.filter((c:Row)=>c.id!==connection.id&&c.provider!==provider);store.state.connections.push(connection);
   store.state.onboarding??={version:1,presets:['home'],completed:false};
   store.state.onboarding.connectionRegions??={};
   const place=region??'home';
   store.state.onboarding.connectionRegions[connection.id]=place;store.recordBuiltRegion(place);
   saveApple(ctx,records,connection);
  }catch(error){store.state=previous;throw error;}
  store.status='Connected. Ask Fox to read this app when you need it.';
 });
}

export async function refreshApple(ctx:SourcesContext,connection:Row){
 const {store}=ctx;
 const revision=store.sourceContentRevision(connection.provider);
 const index=store.state.connections.findIndex((c:Row)=>c.id===connection.id);
 if(index>=0){const row=store.state.connections[index];row.syncStatus='reading';delete row.syncError;store.status=`Reading ${connection.target}…`;store.changed();}
 const records=await readApple(ctx,connection.provider,false);
 if(revision!==store.sourceContentRevision(connection.provider))throw new WorldletError('Source content was cleared while reading. Open the app again.');
 saveApple(ctx,records,connection);
}

function saveApple(ctx:SourcesContext,records:Record<string,string>[],connection:Row){
 const {store}=ctx;
 const index=ctx.currentSourceIndex(connection);
 if(records.length>50||index<0)throw new WorldletError('This connection changed or returned too many records. Open the app again.');
 // Only presentation metadata lives for this app session. Text is returned directly to
 // the Agent by its read tool and is never ingested into sources.
 const originals=Object.fromEntries(Object.entries(store.liveAppOriginals).filter(([key])=>!key.startsWith('live:'+connection.provider+':')));
 const seen=new Set<string>();
 const pages=records.map(record=>{
  const id=record.id;
  if(typeof id!=='string'||!id||id.length>500||seen.has(id))throw new WorldletError('This local app returned invalid records. Retry to refresh it.');
  seen.add(id);
  const key='live:'+connection.provider+':'+id;
  originals[key]={title:record.title??connection.target,text:record.text??'',raw:'',kind:connection.provider};
  const page:Row=Object.fromEntries(Object.entries(record).filter(([field])=>field!=='text'&&field!=='description'));
  page.id=key;page.sourceId=key;
  page.allDay=record.allDay==='true';page.completed=record.completed==='true';page.cancelled=record.cancelled==='true';page.declined=record.declined==='true';
  // Meeting links can be in the event notes; keep those in memory only.
  if(connection.provider==='google-calendar')page.description=record.description??'';
  return page;
 });
 const previous=structuredClone(store.state),previousOriginals=store.liveAppOriginals,previousPages=store.liveAppRecords;
 try{
  store.liveAppOriginals=originals;store.liveAppRecords={...store.liveAppRecords,[connection.provider]:pages};
  const row=store.state.connections[index];row.syncedAt=referenceDate();row.syncStatus='connected';delete row.syncError;
  store.changed();
 }catch(error){store.state=previous;store.liveAppOriginals=previousOriginals;store.liveAppRecords=previousPages;throw error;}
}

// Reviewed Home writes ---------------------------------------------------------------------
async function notesWrite(ctx:SourcesContext,plan:Row,commit:boolean):Promise<Row> {
 requireMac();
 const run=await ctx.run(OSASCRIPT,['-l','JavaScript','-e',NOTES_WRITE],{input:JSON.stringify({...plan,commit}),limit:2_000_000}).catch(()=>{throw new WorldletError('Notes returned an unsupported result.');});
 if(run.code!==0)throw new WorldletError('Notes could not finish this operation. Check Notes and Automation permission before preparing another change.');
 try{const value=JSON.parse(run.stdout);if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch{}
 throw new WorldletError('Notes returned an unsupported result.');
}
export async function homeWritePrepare(ctx:SourcesContext,plan:Row):Promise<Row> {
 if(plan.provider==='apple-notes')return notesWrite(ctx,plan,false);
 requireMac();
 return eventKit(ctx,WRITE,{mode:'prepare',plan},'The system app could not prepare this change. Read it again.');
}
export async function homeWriteCommit(ctx:SourcesContext,plan:Row,facts:Row):Promise<Row> {
 if(plan.provider==='apple-notes')return notesWrite(ctx,{...facts,...plan},true);
 requireMac();
 return eventKit(ctx,WRITE,{mode:'commit',plan,facts},'The result is unconfirmed. Check the system app before trying again.');
}
