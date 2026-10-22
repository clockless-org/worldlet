/** Settings › Your data (issue #674): everything this World keeps, in one place. One row each for conversations, memory,
 * what the connected services brought in, the Journal, what Agents saved there and the board, with how much each holds
 * (context/connectors/world-context.ts: past conversations are counted, the rest says how much room it takes); then the
 * memory itself (the page passes it in), Save a copy (the World backup, host `dataBackup` export) and, where the host
 * deletes local data, Delete for each service and Delete everything saved, which the host asks about once more. A
 * Journal delete asks here, in the page, first. Nothing technical: no paths, files or record names. */
import {readWorldContextSizes,worldContextRows,worldContextServices,type WorldContextKind,type WorldContextSizes} from '../../context/connectors/index.ts';
import {agentButton as button,agentEl as el,type AgentCall} from './agent-change.ts';
import {settingsIcon,settingsRow} from './settings-rows.ts';

/** Each kind's icon (owner request 2026-10-21: icons make Settings clear at a glance). */
const KIND_ICONS:Record<WorldContextKind,string>={conversations:'chat',memory:'heart',services:'plug',journal:'book','agent-outputs':'file',board:'project'};

type Options={
 /** What Fox and the Agents remember, drawn by the page into this part. */
 memory:HTMLElement;
 /** Show it from the start: Settings opened at the memory (an old entry point). */
 showMemory?:boolean;
 /** Whether this host deletes saved local data (`deleteSourceData`, `clearWorldContent`). */
 localDeletion:()=>boolean;
 /** The practice world: it keeps nothing of the person's own. */
 sample:()=>boolean;
 openJournal:()=>void;
};
const utf8=(text:unknown)=>typeof text==='string'?new TextEncoder().encode(text).length:0;

/** What Fox and the Agents remember, in bytes: Fox's saved sections and each Agent's entries, each text once. */
async function memoryBytes(call:AgentCall):Promise<number> {
 const [fox,agents]=await Promise.all([call('companionMemory',{operation:'list'}).catch(()=>null),call('harnessMemory',{operation:'list'}).catch(()=>null)]);
 const texts=new Set<string>();
 for(const section of Array.isArray(fox?.sections)?fox.sections:[])if(typeof section?.text==='string'&&section.text.trim())texts.add(section.text);
 for(const harness of Array.isArray(agents?.harnesses)?agents.harnesses:[])for(const entry of Array.isArray(harness?.entries)?harness.entries:[])if(typeof entry?.text==='string')texts.add(entry.text);
 return [...texts].reduce((sum,text)=>sum+utf8(text),0);
}

/** The page leads with one row, everything stays on this computer, and Save a copy; then one row per kind with an
 * icon, each with its own Delete that asks first; Show on the memory row opens what Fox and the Agents remember below
 * it. Nothing is folded (owner requests 2026-10-21 and 2026-10-22: Settings for people who know nothing about computers,
 * no Advanced). */
export async function showWorldContext(target:HTMLElement,call:AgentCall,current:()=>boolean,{memory,showMemory=false,localDeletion,sample,openJournal}:Options){
 const page=el('div','companion-settings-context');page.dataset.context='page';
 const rows=el('div','companion-settings-rows'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 const actions=el('div','companion-settings-rows');actions.dataset.context='actions';
 // What Fox and the Agents remember, shown under the list once Show is chosen on the memory row.
 const remembered=el('div','companion-settings-memory');remembered.dataset.context='remembered';remembered.hidden=!showMemory;remembered.append(memory);
 page.append(actions,rows,said);
 target.append(page,remembered);
 let asking:string|null=null;
 const ask=(row:HTMLElement,id:string,question:string,run:()=>Promise<void>)=>{
  const box=el('div','companion-settings-confirm');box.setAttribute('role','group');box.dataset.confirm=id;
  box.append(el('span','',question),button('Delete','confirm-delete-context',async()=>{asking=null;said.textContent='';try{await run();}catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}await draw();},true),
   button('Keep','keep-context',()=>{asking=null;said.textContent='Nothing was deleted.';void draw();}));
  row.append(box);
 };
 /** Deletes every Journal card Fox made (`agents` false) or every one an Agent saved (true), one at a time. */
 async function deleteCards(agents:boolean){
  const listed=await call('artifacts',{operation:'list'});
  const ids=(Array.isArray(listed?.artifacts)?listed.artifacts:[]).filter((a:any)=>typeof a?.id==='string'&&(typeof a.agentId==='string')===agents).map((a:any)=>a.id as string);
  for(const id of ids)await call('artifacts',{operation:'delete',id});
  said.textContent=ids.length?agents?'What your Agents saved is deleted.':'Your Journal is empty now.':'Nothing was left to delete.';
 }
 /** The host asks once more and says what stays (core localDeletionRequest). */
 const hostDelete=(action:string,body:Record<string,unknown>,done:string)=>async()=>{
  said.textContent='';
  try{const result=await call(action,body);if(result?.cancelled)return;said.textContent=done;}
  catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}
  await draw();
 };
 async function draw(){
  const [sizes,bytes]=await Promise.all([call('worldContext').then(readWorldContextSizes).catch(()=>null) as Promise<WorldContextSizes|null>,memoryBytes(call)]);
  if(!current())return;
  rows.replaceChildren();actions.replaceChildren();
  if(sizes)actions.append(settingsRow({icon:{icon:'lock'},title:'Everything stays on this computer',line:'Save a copy to keep it safe. Keep the copy private: it holds your conversations and what your World read.',setting:'save-copy',
   controls:[button('Save a copy','export-world',async()=>{
    said.textContent='Saving a copy of your World…';
    try{const result=await call('dataBackup',{operation:'export'});said.textContent=result?.cancelled?'':'A copy of your World is saved. Keep it private: it holds your conversations and what your World read.';}
    catch(e){said.textContent=(e as Error).message||'Could not save a copy.';}
   },true)]}));
  if(!sizes&&sample()){rows.append(el('p','companion-info-note','The sample world keeps nothing of yours. Turn it off in General to see your own World’s context.'));}
  for(const item of worldContextRows(sizes,bytes)){
   const row=el('div','companion-settings-row has-icon'),words=el('div'),controls=el('span','companion-settings-actions');row.dataset.context=item.id;row.dataset.empty=String(item.empty);
   words.append(el('strong','',item.title),el('span','companion-settings-context-amount',item.amount),el('span','companion-settings-quiet',item.line));
   row.append(settingsIcon({icon:KIND_ICONS[item.id]??'file'}),words,controls);
   if(item.id==='memory')controls.append(button(remembered.hidden?'Show':'Hide','show-memory',()=>{remembered.hidden=!remembered.hidden;if(!remembered.hidden)remembered.scrollIntoView({block:'start'});void draw();}));
   if(item.id==='services'){
    const services=worldContextServices(sizes);
    if(services.length){
     const list=el('ul','companion-settings-context-services');list.setAttribute('aria-label','From each service');
     for(const service of services){
      const line=el('li','');line.dataset.provider=service.provider;line.append(el('span','',`${service.name} · ${service.amount}`));
      if(localDeletion())line.append(button('Delete','delete-service-context',hostDelete('deleteSourceData',{provider:service.provider},`What ${service.name} brought in is deleted. It is read again while it stays connected.`)));
      list.append(line);
     }
     words.append(list);
    }
   }
   if(item.id==='journal')controls.append(button('Open Journal','open-journal',()=>openJournal()));
   if((item.id==='journal'||item.id==='agent-outputs')&&!item.empty){
    const agents=item.id==='agent-outputs';
    if(asking===item.id)ask(row,item.id,agents?'Delete everything your Agents saved to your Journal? This can’t be undone.':'Delete every card in your Journal? This can’t be undone.',()=>deleteCards(agents));
    else controls.append(button('Delete…','delete-'+item.id,()=>{asking=item.id;said.textContent='';void draw();}));
   }
   rows.append(row);
  }
  if(sizes&&localDeletion()&&worldContextServices(sizes).length)rows.append(settingsRow({icon:{icon:'alert'},title:'Everything saved from your services',line:'Worldlet asks you once more first.',setting:'clear-world-content',
   controls:[button('Delete all','clear-world-content',hostDelete('clearWorldContent',{},'Everything your World saved from your services is deleted.'))]}));
 }
 await draw();
}
