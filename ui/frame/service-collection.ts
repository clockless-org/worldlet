import {notionPageId} from '../../context/connectors/index.ts';
import {agentEl as el,agentButton} from './agent-change.ts';

/** Owner settings for saved Notion context. OAuth remains in the existing connection flow; the host validates every
 * preset and schedule. Opening this view only reads status, never enables collection or requests provider data. */
export async function showServiceCollection(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('section','companion-settings-service-collection'),status=el('p','companion-settings-status');
 box.dataset.accounts='saved-notion';status.setAttribute('role','status');
 target.append(box,status);
 const time=(value:unknown)=>typeof value==='number'?new Date(value*1000).toLocaleString():'Not yet';
 const button=(label:string,action:string,work:()=>Promise<void>)=>agentButton(label,action,async()=>{
  try{await work();}catch(error){if(current())status.textContent=(error as Error).message||'Could not update collection.';}
 });
 async function draw(){
  let presets:any[],jobs:any[];
  try{const [saved,sync]=await Promise.all([call('servicePresets',{operation:'list'}),call('serviceSync',{operation:'list'})]);presets=saved.presets||[];jobs=sync.jobs||[];}
  catch(error){if(current())box.replaceChildren(el('h5','companion-settings-subhead','Saved Notion pages'),el('p','companion-info-note',(error as Error).message||'Collection settings are unavailable.'));return;}
  if(!current())return;
  const rows=el('div','companion-settings-rows');
  for(const preset of presets.filter(p=>p.provider==='notion')){
   const job=jobs.find(j=>j.id===preset.id),check=job?.check,row=el('div','companion-settings-row'),text=el('div');row.dataset.preset=preset.id;
   const state=!job?'Not enabled':!check.enabled?'Paused':!job.available?'Connection or page selection changed — enable again':check.lastStatus==='error'?'Last attempt failed; saved content is kept':check.lastStatus==='running'?'Collecting…':check.lastStatus==='partial'?'Collecting more pages…':job.snapshotAt?'Saved':'Waiting for first collection';
   text.append(el('strong','',preset.name),el('span','',state),el('span','',`Last saved: ${time(job?.snapshotAt)}`));
   if(check?.enabled)text.append(el('span','',`Every ${check.intervalMinutes} minutes · Next: ${time(check.nextAt)}`));
   row.append(text);
   if(check?.enabled&&!job.available)row.append(button('Enable again','renew-collection',async()=>{
    await call('serviceSync',{operation:'configure',id:preset.id,enabled:true,intervalMinutes:check.intervalMinutes});status.textContent='Collection enabled.';await draw();
   }));
   row.append(button(check?.enabled?'Pause':'Enable','toggle-collection',async()=>{
    await call('serviceSync',{operation:'configure',id:preset.id,enabled:!check?.enabled,intervalMinutes:check?.intervalMinutes??30});status.textContent=check?.enabled?'Collection paused. Saved content is hidden from Agents until enabled again.':'Collection enabled.';await draw();
   }));rows.append(row);
  }
  if(!rows.childElementCount)rows.append(el('p','companion-info-note','No pages are saved yet. Choose a page to make it available as saved World context.'));
  const form=el('div','companion-settings-row'),fields=el('div');
  const field=(title:string)=>{const label=el('label','',title),input=el('input','companion-settings-input') as HTMLInputElement;input.setAttribute('aria-label',title);input.autocomplete='off';input.spellcheck=false;label.append(input);fields.append(label);return input;};
  const name=field('Page name'),page=field('Notion page URL or ID');name.maxLength=80;
  const label=el('label','','Collect every'),interval=el('select','companion-settings-input') as HTMLSelectElement;interval.setAttribute('aria-label','Collect every');
  for(const [value,title] of [[15,'15 minutes'],[30,'30 minutes'],[60,'1 hour'],[360,'6 hours'],[1440,'1 day']] as const){const option=el('option','',title) as HTMLOptionElement;option.value=String(value);option.selected=value===30;interval.append(option);}label.append(interval);fields.append(label);
  form.append(fields,button('Save and enable','save-collection',async()=>{
   const pageId=notionPageId(page.value.trim());
   const saved=await call('servicePresets',{operation:'save',preset:{id:'notion-'+pageId,name:name.value.trim(),provider:'notion',read:{operation:'read',id:pageId}}});
   await call('serviceSync',{operation:'configure',id:saved.preset.id,enabled:true,intervalMinutes:Number(interval.value)});
   status.textContent='Collection enabled. Use Refresh status to check the first saved copy.';await draw();
  }));
  box.replaceChildren(el('h5','companion-settings-subhead','Saved Notion pages'),
   el('p','companion-info-note','Worldlet saves only the pages you choose using its own Notion connection. Linked pages, database rows and comments are not included. Agents read saved copies; connecting Notion alone does not collect pages.'),
   button('Connect Notion','connect-notion',async()=>{await call('connect',{provider:'notion'});status.textContent='Notion connected. Choose a page to collect.';await draw();}),
   rows,form,button('Refresh status','refresh-collection',draw));
 }
 await draw();
}
