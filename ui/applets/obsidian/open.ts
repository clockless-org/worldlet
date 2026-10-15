import {resolveVaultNote,vaultWikiLinks} from '../../../core/applets/index.ts';
import type {AppletSceneRegion} from '../scene/applet-scene.ts';
import logo from './logo.ts';
const states=new WeakMap<HTMLElement,{selected:string;query:string;closed:Set<string>}>();
/** Optional measured vault layout. All reads and connection actions belong to the host. */
export function renderVaultScene(region:HTMLElement,room,items,value,regions:readonly AppletSceneRegion[]=[]){
 const slot=(id:string)=>regions.find(r=>r.id===id)?.element,index=slot('vault-index'),links=slot('vault-links'),heading=slot('vault-heading'),toolbar=slot('vault-toolbar');
 if(!index||!links||!heading||!toolbar||!value.vault||region.closest('.applet-scene')?.getAttribute('data-compact')==='true'){delete region.dataset.vaultReader;for(const node of [region,index,links,heading,toolbar])node?.classList.remove('vault-region');return null;}
 const api=value.vault,notes=api.pages||[],ids=notes.map(p=>p.id),state=states.get(region)||{selected:'',query:'',closed:new Set<string>()};states.set(region,state);
 for(const node of [region,index,links,heading,toolbar]){node.replaceChildren();node.classList.add('vault-region');}
 region.dataset.vaultReader='true';
 const el=(tag:string,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
 const button=(label,run,cls='scene-button')=>{const b=el('button',label,cls) as HTMLButtonElement;b.type='button';b.onclick=run;return b;};
 const mark=Object.assign(el('img','','vault-logo'),{src:logo.source,alt:''});heading.append(mark,el('h2',room.title),el('span',value.sample?'Fictional vault':'Read-only vault','vault-caption'));
 const caption=el('span',value.scope||(value.connected?'Selected vault':'No vault selected'),'vault-caption');toolbar.append(caption);if(api.choose)toolbar.append(button(value.connected?'Change vault':'Choose vault',()=>api.choose()));if(value.connected&&api.disconnect)toolbar.append(button('Disconnect',()=>api.disconnect()));
 const search=el('input') as HTMLInputElement;search.type='search';search.placeholder='Find a note';search.setAttribute('aria-label','Find a vault note');search.value=state.query;
 const tree=el('nav','','vault-tree');tree.setAttribute('aria-label','Vault notes');index.append(search,tree);
 const path=el('p','','vault-path'),title=Object.assign(el('h1'),{tabIndex:-1}),body=el('div','','vault-body');region.append(path,title,body);links.append(el('h3','Linked notes'));const related=el('nav','','vault-related');related.setAttribute('aria-label','Linked notes');links.append(related);
 let serial=0;
 function draw(){
  const focusId=(document.activeElement as HTMLElement)?.dataset.noteId;tree.replaceChildren();const q=state.query.toLowerCase(),folders=new Map<string,HTMLElement>([['',tree]]);
  for(const note of notes.filter(n=>(n.id+' '+n.title).toLowerCase().includes(q)).sort((a,b)=>a.id.localeCompare(b.id))){
   const parts=note.id.split('/');let parent=tree,prefix='';
   for(const part of parts.slice(0,-1)){prefix=prefix?prefix+'/'+part:part;if(!folders.has(prefix)){const details=el('details','','vault-folder') as HTMLDetailsElement;details.dataset.folder=prefix;details.open=!!q||!state.closed.has(prefix);const key=prefix;details.ontoggle=()=>{if(details.open)state.closed.delete(key);else state.closed.add(key);};details.append(el('summary',part));parent.append(details);folders.set(prefix,details);}parent=folders.get(prefix)!;}
   const row=button(note.id.endsWith('.md')?parts.at(-1):note.title,()=>void read(note.id),'vault-note');row.dataset.noteId=note.id;row.setAttribute('aria-pressed',String(state.selected===note.id));parent.append(row);
  }
  if(focusId)for(const row of tree.querySelectorAll<HTMLButtonElement>('.vault-note'))if(row.dataset.noteId===focusId)row.focus({preventScroll:true});
  if(!tree.children.length)tree.append(el('p',notes.length?'No matching notes.':value.connected?'This vault has no Markdown notes.':'Choose a vault to read its notes.','vault-caption'));
 }
 async function read(id:string){
  const note=notes.find(n=>n.id===id);if(!note)return;const moveFocus=body.contains(document.activeElement)||related.contains(document.activeElement),request=++serial;state.selected=id;draw();path.textContent=id+' · Read-only';title.textContent=note.title;body.replaceChildren(el('p','Reading note…'));related.replaceChildren();
  try{
   const result=await api.read(id);if(request!==serial||!body.isConnected)return;const source=result.page||result,text=source.markdown??source.text;if(typeof text!=='string')throw Error(result.error||'Note is unavailable.');
   const wiki=vaultWikiLinks(text,id,ids);let markdown=text;
   for(const link of [...wiki].reverse())if(link.id){const label=link.label.replace(/[\\[\]]/g,'\\$&');markdown=markdown.slice(0,link.start)+'['+label+'](#vault-note='+encodeURIComponent(link.id)+')'+markdown.slice(link.end);}
   const localLink=(href:string)=>{const target=href.startsWith('#vault-note=')?resolveVaultNote(href.slice(12),'',ids):resolveVaultNote(href,id,ids);return target?()=>void read(target):null;};
   body.replaceChildren(text.trim()?api.renderMarkdown(markdown,{title:note.title,path:id,localLink}):el('p','This note has no body text.','vault-caption'));body.scrollTop=0;if(moveFocus)title.focus({preventScroll:true});
   const unique=[...new Set(wiki.map(l=>l.id).filter(Boolean))];for(const target of unique){const n=notes.find(n=>n.id===target);const b=button(n.title,()=>void read(target),'vault-linked-note');b.append(el('small',target));related.append(b);}if(!unique.length)related.append(el('p','No linked notes found in this vault.','vault-caption'));
   if(wiki.some(l=>!l.id))related.append(el('p','Some links are missing or ambiguous.','vault-caption'));
   api.selected?.(note,source);
  }catch(error){if(request!==serial||!body.isConnected)return;body.replaceChildren(el('p',String(error.message||error),'app-device-error'),button('Retry',()=>void read(id)));}
 }
 search.oninput=()=>{state.query=search.value;draw();};draw();
 if(notes.length)void read(ids.includes(state.selected)?state.selected:notes[0].id);else{path.textContent='Read-only';title.textContent=room.title;body.append(el('p',value.error||'Choose a note from the vault.'));}
 return items;
}
