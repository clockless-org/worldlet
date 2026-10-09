/** Theme-only presentation. Records, persistence and permission decisions belong to its host. */
export type VillageKind='mail'|'calendar'|'notes'|'reminders';
export type VillageItem={id:string;title:string;text?:string;meta?:string;start?:string;end?:string;due?:string;completed?:boolean;editable?:boolean;record?:Record<string,any>};
export type VillageState={selected?:string;query?:string;offset?:number;filter?:string;draft?:{item?:VillageItem;reply?:VillageItem;values:Record<string,string>}};
export type VillageOptions={kind:VillageKind;items:VillageItem[];now?:number;sample?:boolean;status?:string;state?:VillageState;assetRoot?:string;onOpen?:(item:VillageItem)=>void;onSave?:(item:VillageItem)=>Promise<void>|void;onDelete?:(item:VillageItem)=>Promise<void>|void;onAdvanced?:()=>void};
export const titles={mail:'Mail',calendar:'Calendar',notes:'Notes',reminders:'Reminders'};
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
const button=(text:string,run:()=>void,cls='')=>{const b=node('button',cls,text);b.type='button';b.onclick=run;return b;};
export const localDate=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const time=(s?:string)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'';
const dateTime=(s?:string)=>s&&Number.isFinite(Date.parse(s))?localDate(new Date(s))+'T'+new Date(s).toTimeString().slice(0,5):'';
export function renderVillageSurface(host:HTMLElement,options:VillageOptions){
 const {kind}=options,asset=options.assetRoot||'theme-assets/',items=options.items.map(i=>({...i})),state=options.state||{};
 const root=node('section','village-surface');root.dataset.kind=kind;root.setAttribute('aria-label',titles[kind]+' workspace');host.append(root);
 const plate=node('img','village-plate');plate.src=asset+kind+'-scene.png';plate.alt='';plate.draggable=false;root.append(plate);
 const header=node('header','village-heading');header.append(node('h1','',titles[kind]));root.append(header);
 const status=node('p','village-status',options.status||(options.sample?'Demo · Local changes only':'Saved records'));status.setAttribute('role','status');root.append(status);
 if(kind==='mail'){const device=node('img','village-device');device.src=asset+'mail-icon.png';device.alt='Mail applet';device.draggable=false;root.append(device);}
 const body=node('div','village-body'),list=node('nav','village-list'),reader=node('article','village-reader');list.setAttribute('aria-label',titles[kind]+' items');reader.tabIndex=0;body.append(list,reader);root.append(body);
 const tools=node('div','village-tools');header.append(tools);
 const now=new Date(options.now||Date.now());const day=()=>{const d=new Date(now);d.setDate(d.getDate()+(state.offset||0));return d;};
 const empty=node('p','');let busy=false;
 const announce=(text:string)=>{status.textContent=text;};
 const selected=()=>items.find(i=>i.id===state.selected);
 function dirtyGate(run:()=>void){if(!state.draft){run();return;}const old=root.querySelector('.village-discard');if(old)return;
  const confirm=node('div','village-discard');confirm.setAttribute('role','alert');confirm.append(node('span','','Discard unsaved changes?'),button('Keep editing',()=>confirm.remove()),button('Discard',()=>{delete state.draft;confirm.remove();run();}));reader.prepend(confirm);
 }
 const act=(run:()=>void)=>()=>dirtyGate(run);
 async function saveItem(item:VillageItem){if(busy)return;busy=true;try{await options.onSave!(item);const index=items.findIndex(i=>i.id===item.id);if(index<0)items.unshift(item);else items[index]=item;return true;}catch{announce('Could not save. Your changes are still here. Try again.');return false;}finally{busy=false;}}
 function show(item?:VillageItem){reader.replaceChildren();if(!item){reader.append(node('h2','','Nothing here yet'),node('p','',state.query?'Try another search.':'Choose another day or add a local item.'));return;}
  state.selected=item.id;for(const b of list.querySelectorAll<HTMLElement>('[data-item-id]'))b.setAttribute('aria-current',String(b.dataset.itemId===item.id));
  reader.append(node('p','village-eyebrow',item.meta||(options.sample?'Local demo':'Saved record')),node('h2','',item.title));
  if(kind==='calendar')reader.append(node('p','village-event-time',item.record?.allDay?'All day':time(item.start)+(item.end?' – '+time(item.end):'')));
  if(kind==='reminders'&&item.due)reader.append(node('p','village-event-time','Due '+new Date(item.due).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})));
  const copy=node('div','village-copy',item.text||'');reader.append(copy);
  const actions=node('footer','village-actions');reader.append(actions);
  if(options.onOpen)actions.append(button('Open original',()=>options.onOpen!(item)));
  if(options.onSave&&(item.editable||kind==='mail'))actions.append(button(kind==='mail'?'Reply draft':kind==='notes'?'Edit note':kind==='reminders'?'Edit reminder':'Edit event',()=>edit(kind==='mail'?undefined:item,kind==='mail'?item:undefined),'village-primary'));
  if(kind==='reminders'&&options.onSave&&item.editable)actions.append(button(item.completed?'Mark incomplete':'Complete',()=>void toggle(item),'village-primary'));
  if(options.onDelete&&item.editable)actions.append(button('Delete',()=>{const confirm=node('div','village-confirm');confirm.append(node('span','','Delete this local item?'),button('Delete item',async()=>{if(busy)return;busy=true;try{await options.onDelete!(item);items.splice(items.findIndex(i=>i.id===item.id),1);state.selected='';draw();announce('Deleted locally');}catch{announce('Could not delete. Try again.');}finally{busy=false;}}),button('Cancel',()=>show(item)));actions.replaceChildren(confirm);}));
 }
 async function toggle(item:VillageItem){if(await saveItem({...item,completed:!item.completed})){draw();announce(item.completed?'Marked incomplete':'Completed locally');}}
 function edit(item?:VillageItem,reply?:VillageItem){
  state.draft||={item,reply,values:{title:item?.title||(reply?'Re: '+reply.title:''),text:item?.text||'',start:dateTime(item?.start)||localDate(day())+'T10:00',end:dateTime(item?.end)||localDate(day())+'T11:00',due:dateTime(item?.due)}};
  const draft=state.draft;item=draft.item;reply=draft.reply;reader.replaceChildren();const form=node('form','village-editor');reader.append(form);
  form.append(node('h2','',item?'Edit '+titles[kind].toLowerCase():kind==='mail'?'New local draft':'New '+(kind==='calendar'?'event':kind==='reminders'?'reminder':'note')));
  const field=(name:string,label:string,type='text',multiline=false)=>{const wrap=node('label','village-field',label),input=multiline?node('textarea'):node('input');input.name=name;input.value=draft.values[name]||'';if(input instanceof HTMLInputElement)input.type=type;input.oninput=()=>{draft.values[name]=input.value;input.setCustomValidity('');};wrap.append(input);return {wrap,input};};
  const title=field('title','Title');title.input.required=true;form.append(title.wrap);
  let start:ReturnType<typeof field>|undefined,end:ReturnType<typeof field>|undefined,due:ReturnType<typeof field>|undefined;
  if(kind==='calendar'){start=field('start','Starts','datetime-local');end=field('end','Ends','datetime-local');start.input.required=end.input.required=true;const times=node('div','village-times');times.append(start.wrap,end.wrap);form.append(times);}
  if(kind==='reminders'){due=field('due','Due (optional)','datetime-local');form.append(due.wrap);}
  const text=field('text',kind==='mail'?'Message':'Notes','text',true);form.append(text.wrap);
  if(kind==='mail')form.append(node('small','','Saved on this device. This does not send an email.'));
  const actions=node('footer','village-actions'),save=button(kind==='mail'?'Save draft':'Save',()=>{},'village-primary');save.type='submit';actions.append(save,button('Cancel',()=>dirtyGate(()=>show(selected()))));form.append(actions);
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;
   if(!title.input.value.trim()){title.input.setCustomValidity('Enter a title');title.input.reportValidity();return;}
   if(start&&end&&(!Number.isFinite(Date.parse(start.input.value))||!Number.isFinite(Date.parse(end.input.value))||Date.parse(end.input.value)<=Date.parse(start.input.value))){end.input.setCustomValidity('End must be after start');end.input.reportValidity();return;}
   const next:VillageItem={...item,id:item?.id||'village-local:'+crypto.randomUUID(),title:title.input.value.trim(),text:text.input.value,editable:true,meta:kind==='mail'?'Local draft · Not sent':item?.meta||'Local'};
   if(start&&end){next.start=new Date(start.input.value).toISOString();next.end=new Date(end.input.value).toISOString();}
   if(due)next.due=due.input.value?new Date(due.input.value).toISOString():undefined;
   save.disabled=true;if(await saveItem(next)){delete state.draft;state.selected=next.id;state.query='';if(kind==='calendar'&&next.start){const target=new Date(next.start);target.setHours(12,0,0,0);const origin=new Date(now);origin.setHours(12,0,0,0);state.offset=Math.round((+target-+origin)/86400000);}const search=tools.querySelector('input');if(search)search.value='';draw();announce(kind==='mail'?'Draft saved locally · Not sent':'Saved locally');reader.focus();}else save.disabled=false;
  };
  requestAnimationFrame(()=>{if(form.isConnected)title.input.focus();});
 }
 let week:HTMLElement|undefined;
 if(kind==='calendar'){
  const month=node('span','village-month');header.insertBefore(month,tools);
  tools.append(button('Previous',act(()=>{state.offset=(state.offset||0)-7;draw();})),button('Today',act(()=>{state.offset=0;draw();})),button('Next',act(()=>{state.offset=(state.offset||0)+7;draw();})));
  week=node('nav','village-week');week.setAttribute('aria-label','Calendar week');root.append(week);
  if(options.onAdvanced)tools.append(button('Week / month',act(options.onAdvanced)));
 }else{const search=node('input','village-search');search.type='search';search.placeholder='Search '+titles[kind].toLowerCase()+'…';search.setAttribute('aria-label','Search '+titles[kind].toLowerCase());search.value=state.query||'';search.oninput=()=>{if(state.draft){search.value=state.query||'';dirtyGate(()=>{search.focus();});return;}state.query=search.value;draw();};tools.append(search);}
 if(options.onSave)tools.append(button(kind==='mail'?'Compose':kind==='calendar'?'New event':kind==='reminders'?'New reminder':'New note',act(()=>edit()),'village-primary'));
 function draw(){list.replaceChildren();if(week){const month=root.querySelector('.village-month');if(month)month.textContent=day().toLocaleDateString('en-US',{month:'long',year:'numeric'});week.replaceChildren();const monday=new Date(day());monday.setDate(monday.getDate()-((monday.getDay()+6)%7));for(let n=0;n<7;n++){const d=new Date(monday);d.setDate(d.getDate()+n);const b=button(d.toLocaleDateString('en-US',{weekday:'short',day:'numeric'}),act(()=>{state.offset=(state.offset||0)+Math.round((+d-+day())/86400000);draw();}));b.setAttribute('aria-pressed',String(localDate(d)===localDate(day())));week.append(b);}list.append(node('h2','village-day',day().toLocaleDateString('en-US',{weekday:'short',day:'numeric',month:'short'})));}
  if(kind==='reminders'){const filters=node('div','village-filters');for(const f of ['Active','Completed','All']){const b=button(f,act(()=>{state.filter=f;draw();}));b.setAttribute('aria-pressed',String((state.filter||'Active')===f));filters.append(b);}list.append(filters);}
  const visible=items.filter(i=>(!state.query||(i.title+' '+(i.text||'')).toLowerCase().includes(state.query.toLowerCase()))&&(kind!=='calendar'||i.start&&localDate(new Date(i.start))===localDate(day()))&&(kind!=='reminders'||state.filter==='All'||(state.filter==='Completed'?i.completed:!i.completed)));
  if(kind==='calendar')visible.sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  for(const item of visible){const row=node('div','village-row');const b=button('',act(()=>show(item)),'village-item');b.dataset.itemId=item.id;b.append(node('strong','',item.title));b.append(node('small','',kind==='calendar'?time(item.start):item.meta||'Saved record'));if(item.completed)b.dataset.completed='true';
   if(kind==='reminders'){const check=node('input','village-check');check.type='checkbox';check.checked=!!item.completed;check.disabled=!options.onSave||!item.editable;check.setAttribute('aria-label','Complete '+item.title);check.onchange=()=>{check.checked=!!item.completed;dirtyGate(()=>void toggle(item));};row.append(check);}row.append(b);list.append(row);
  }
  if(!visible.length){empty.textContent='No matching '+(kind==='calendar'?'events':kind==='reminders'?'reminders':'items')+'.';list.append(empty);}
  if(state.draft)edit();else show(visible.find(i=>i.id===state.selected)||visible[0]);
 }
 draw();return root;
}
