import {node,uiIcon} from '../../components/index.ts';

/** Notes owns only the notebook interaction. The host supplies saved originals and its safe Markdown renderer. */
export interface NotesActions {
 read(item:any):Promise<{text:string;title?:string}>;
 renderBody(text:string,title:string):HTMLElement;
 create():void;
 selected?(item:any,original:{text:string;title?:string},explicit:boolean):void;
}
type NotebookState={query:string;folder:string;selected:string};
const notebooks=new WeakMap<object,NotebookState>();
const folderOf=item=>String(item.record?.folder||item.record?.list||'Notes');
const plain=value=>String(value||'').replace(/[#*_`>]/g,'').replace(/\s+/g,' ').trim();
function dateOf(item){const value=item.record?.modifiedAt||item.record?.updatedAt;if(!value)return '';const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?value+'T12:00:00':value);return Number.isNaN(+date)?'':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function icon(name:string){const span=node('span','notes-glyph');span.innerHTML=uiIcon(name);return span;}
function control(label:string,action:()=>void,glyph?:string){const b=node('button','notes-control');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(glyph)b.append(icon(glyph));else b.textContent=label;b.onclick=action;return b;}

export function renderNotesOpen(panel:HTMLElement,items:any[],value:any,owner:object,pick:(item:any)=>void){
 const state=notebooks.get(owner)||{query:'',folder:'',selected:''};notebooks.set(owner,state);
 const actions:NotesActions|undefined=value?.notes;
 if(panel.classList.contains('applet-scene-region'))panel.classList.add('notes-host');
 const book=node('section','notes-notebook');book.setAttribute('aria-label','Notes notebook');
 const header=node('header','notes-header'),heading=node('h2','','Notes');heading.prepend(icon('book'));
 const search=node('input','notes-search') as HTMLInputElement;search.type='search';search.placeholder='Search notes…';search.setAttribute('aria-label','Search notes');search.value=state.query;
 const searchBox=node('label','notes-searchbox');searchBox.append(icon('search'),search);
 header.append(heading,searchBox);if(actions?.create)header.append(control('New note with Fox',()=>actions.create(),'plus'));
 const pages=node('div','notes-pages'),left=node('aside','notes-index'),tabs=node('nav','notes-folders'),list=node('div','notes-list');
 tabs.setAttribute('aria-label','Note folders');list.setAttribute('aria-label','Notes');left.append(tabs,list);
 const right=node('section','notes-page');right.setAttribute('aria-label','Selected note');pages.append(left,right);book.append(header,pages);panel.append(book);
 let serial=0,filtered:any[]=[];
 const folders=[...new Set(items.map(folderOf))];if(state.folder&&!folders.includes(state.folder))state.folder='';
 function paintTabs(){tabs.replaceChildren();for(const folder of ['',...folders]){const tab=control(folder||'All',()=>{state.folder=folder;paintTabs();paintList();});tab.setAttribute('aria-pressed',String(state.folder===folder));tabs.append(tab);}}
 function paintList(explicit=false){
  const query=state.query.toLocaleLowerCase().trim();filtered=items.filter(item=>(!state.folder||folderOf(item)===state.folder)&&(!query||[item.title,item.summary,item.context,item.record?.text,folderOf(item)].some(v=>String(v||'').toLocaleLowerCase().includes(query))));
  list.replaceChildren();if(!filtered.some(item=>item.id===state.selected))state.selected=filtered[0]?.id||'';
  for(const item of filtered){const row=control(item.title,()=>{state.selected=item.id;book.dataset.reading='true';paintList(true);const focus=left.getClientRects().length?list.querySelector<HTMLButtonElement>('[aria-pressed=true]'):right.querySelector<HTMLButtonElement>('.notes-back');focus?.focus({preventScroll:true});});row.replaceChildren();row.className='notes-row';row.dataset.itemId=item.id;row.setAttribute('aria-pressed',String(item.id===state.selected));
   const badge=node('span','notes-note-stamp');badge.append(icon('file'));badge.setAttribute('aria-hidden','true');
   const copy=node('span','notes-note-copy');copy.append(node('strong','',item.title),node('span','notes-snippet',plain(item.summary||item.record?.text||item.context)||folderOf(item)),node('small','',dateOf(item)||folderOf(item)));
   row.append(badge,copy);if(item.attention){const mark=node('span','notes-unread');mark.setAttribute('aria-label','Needs attention');row.append(mark);}list.append(row);
  }
  if(!filtered.length)list.append(node('p','notes-empty',items.length?'No matching notes.':value?.reading?'Reading notes…':value?.connected?'Your notebook is ready.':'Connect Notes with Fox to see your notes.'));
  void paintPage(filtered.find(item=>item.id===state.selected),explicit);
 }
 async function paintPage(item,explicit=false){
  const request=++serial;right.replaceChildren();right.dataset.open=String(!!item);
  if(!item){right.append(node('p','notes-empty',value?.error||(items.length?'Try another folder or search.':'Select a note to read it here.')));return;}
  const back=control('All notes',()=>{right.dataset.open='false';book.dataset.reading='false';},'back');back.classList.add('notes-back');
  const meta=node('div','notes-page-meta');meta.append(back,node('time','',dateOf(item)));
  const title=node('h3','notes-title',item.record?.title||item.title),body=node('div','notes-prose');body.setAttribute('aria-live','polite');
  const footer=node('footer','notes-footer'),tools=node('div','notes-tools'),copy=control('Copy note',()=>{},'file');copy.disabled=true;
  const open=control('Open original',()=>pick(item),'book');open.append(node('span','','Original'));copy.append(node('span','','Copy'));tools.append(open,copy);footer.append(tools,node('span','notes-folder-tag',folderOf(item)));
  right.append(meta,title,body,footer);
  body.append(node('p','notes-status','Reading note…'));
  try{
   const original=actions?.read?await actions.read(item):{text:item.record?.text||item.summary||item.context||'',title:item.title};
   if(request!==serial||!book.isConnected)return;if(typeof original?.text!=='string')throw Error('This note is unavailable.');
   body.replaceChildren();if(actions?.renderBody)body.append(actions.renderBody(original.text,original.title||item.title));else body.append(node('div','notes-plain',original.text));
   if(!original.text.trim())body.append(node('p','notes-status','This note is empty.'));
   copy.disabled=false;copy.onclick=async()=>{try{await navigator.clipboard.writeText(original.text);copy.title='Copied';copy.setAttribute('aria-label','Copied');}catch{copy.title='Copy unavailable — select the note text to copy';copy.setAttribute('aria-label',copy.title);}};
   if(right.getClientRects().length)actions?.selected?.(item,original,explicit);
  }catch(error){if(request!==serial||!book.isConnected)return;body.replaceChildren(node('p','notes-status',error.message||'Could not read this note.'),control('Try again',()=>void paintPage(item,explicit)));}
 }
 search.oninput=()=>{state.query=search.value;paintList();};paintTabs();paintList();
 return items;
}
