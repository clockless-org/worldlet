/** Settings › Context (issue #674): everything this World keeps, in one place. One row each for conversations, memory,
 * what the connected services brought in, the Journal, what Agents saved there and the board, with how much each holds
 * (core/context/world-context.ts: past conversations are counted, the rest says how much room it takes); then the
 * memory itself (the page passes it in), Save a copy (the World backup, host `dataBackup` export) and, where the host
 * deletes local data, Delete for each service and Delete everything saved, which the host asks about once more. A
 * Journal delete asks here, in the page, first. Nothing technical: no paths, files or record names. */
import {readWorldContextSizes,worldContextRows,worldContextServices,type WorldContextKind,type WorldContextSizes} from '../../core/context/index.ts';
import {agentButton as button,agentEl as el,type AgentCall} from './agent-change.ts';

type Options={
 /** What Fox and the Agents remember, drawn by the page into this part. */
 memory:HTMLElement;
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

export async function showWorldContext(target:HTMLElement,call:AgentCall,current:()=>boolean,{memory,localDeletion,sample,openJournal}:Options){
 const page=el('div','companion-settings-context');page.dataset.context='page';
 const rows=el('div','companion-settings-rows'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 const actions=el('div','companion-settings-actions');actions.dataset.context='actions';
 page.append(el('p','companion-info-note','Everything your World keeps, on this computer. Save a copy to keep it safe, or delete what you no longer need.'),rows,said);
 target.append(page,actions,memory);
 let asking:WorldContextKind|null=null;
 const ask=(row:HTMLElement,question:string,label:string,run:()=>Promise<void>)=>{
  const box=el('div','companion-settings-confirm');box.setAttribute('role','group');box.dataset.confirm=row.dataset.context??'';
  box.append(el('span','',question),button(label,'confirm-delete-context',async()=>{asking=null;said.textContent='';try{await run();}catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}await draw();},true),
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
 async function draw(){
  const [sizes,bytes]=await Promise.all([call('worldContext').then(readWorldContextSizes).catch(()=>null) as Promise<WorldContextSizes|null>,memoryBytes(call)]);
  if(!current())return;
  rows.replaceChildren();
  if(!sizes&&sample()){rows.append(el('p','companion-info-note','The sample world keeps nothing of yours. Turn it off in General to see your own World’s context.'));}
  for(const item of worldContextRows(sizes,bytes)){
   const row=el('div','companion-settings-row'),words=el('div');row.dataset.context=item.id;row.dataset.empty=String(item.empty);
   words.append(el('strong','',item.title),el('span','companion-settings-context-amount',item.amount),el('span','companion-settings-quiet',item.line));
   row.append(words);
   if(item.id==='conversations'&&!item.empty)words.append(el('span','companion-settings-quiet','Reset, under Help, starts over without them.'));
   if(item.id==='memory')row.append(button('Show','show-memory',()=>memory.scrollIntoView({block:'start'})));
   if(item.id==='services'){
    const services=worldContextServices(sizes);
    if(services.length){
     const list=el('ul','companion-settings-context-services');list.setAttribute('aria-label','From each service');
     for(const service of services){
      const line=el('li','');line.dataset.provider=service.provider;line.append(el('span','',`${service.name} · ${service.amount}`));
      // The host asks once more and says what stays (core localDeletionRequest).
      if(localDeletion())line.append(button('Delete','delete-service-context',async()=>{
       said.textContent='';
       try{const result=await call('deleteSourceData',{provider:service.provider});if(result?.cancelled)return;said.textContent=`What ${service.name} brought in is deleted. It is read again while it stays connected.`;}
       catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}
       await draw();
      }));
      list.append(line);
     }
     words.append(list);
    }
   }
   if(item.id==='journal')row.append(button('Open Journal','open-journal',()=>openJournal()));
   if((item.id==='journal'||item.id==='agent-outputs')&&!item.empty){
    const agents=item.id==='agent-outputs';
    if(asking===item.id)ask(row,agents?'Delete everything your Agents saved to your Journal? This can’t be undone.':'Delete every card in your Journal? This can’t be undone.','Delete',()=>deleteCards(agents));
    else row.append(button('Delete…','delete-'+item.id,()=>{asking=item.id;said.textContent='';void draw();}));
   }
   rows.append(row);
  }
  actions.replaceChildren();
  if(sizes){
   actions.append(button('Save a copy','export-world',async()=>{
    said.textContent='Saving a copy of your World…';
    try{const result=await call('dataBackup',{operation:'export'});said.textContent=result?.cancelled?'':'A copy of your World is saved. Keep it private: it holds your conversations and what your World read.';}
    catch(e){said.textContent=(e as Error).message||'Could not save a copy.';}
   },true));
   if(localDeletion())actions.append(button('Delete everything saved','clear-world-content',async()=>{
    said.textContent='';
    try{const result=await call('clearWorldContent');if(result?.cancelled)return;said.textContent='Everything your World saved from your services is deleted.';}
    catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}
    await draw();
   }));
  }
 }
 await draw();
}
