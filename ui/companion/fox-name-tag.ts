// Fox's name tag at its feet (owner request 2026-10-07): at rest it shows the companion's name; while Fox
// works it shows what Fox is doing instead ("Fox · Thinking…", "Fox · Reading it…"), so work that nobody asked
// about in the chat (the day's plan, its summary) needs no card or bubble. Selecting it is the same as selecting
// Fox: the message bar opens. Work outside a chat turn reports here with the `worldlet:fox-status` window event,
// `{source, text}` to show and `{source, text: ''}` when it ends; the newest running one is shown.
export const FOX_STATUS_EVENT='worldlet:fox-status';
export type FoxTagState={name:string;state:string;status?:string};

// What the tag says for the chat's own states; working uses the step Fox is on.
export function foxTagStatus(state:string,status=''){
 if(state==='listening'||state==='preparing')return 'Listening…';
 if(state==='transcribing')return 'Understanding…';
 if(state==='thinking')return 'Thinking…';
 if(state==='working'){const step=status.trim().replace(/[.…]+$/,'');return step?step+'…':'Working…';}
 return '';
}

export function mountFoxNameTag(pet:HTMLElement,open:()=>void){
 const tag=document.createElement('button');tag.type='button';tag.className='fox-name-tag';
 const name=document.createElement('span');name.className='fox-name-tag-name';
 const doing=document.createElement('span');doing.className='fox-name-tag-status';doing.hidden=true;
 tag.append(name,doing);pet.append(tag);
 tag.addEventListener('pointerdown',e=>e.stopPropagation());
 tag.onclick=e=>{e.stopPropagation();open();};
 const background=new Map<string,string>();let last:FoxTagState={name:'Fox',state:'idle'};
 const render=()=>{
  // Work outside the chat names itself; a quiet turn running it would only say Thinking….
  const status=[...background.values()].at(-1)||foxTagStatus(last.state,last.status);
  name.textContent=last.name;doing.textContent=status;doing.hidden=!status;
  tag.dataset.busy=String(!!status);
  tag.setAttribute('aria-label',status?last.name+': '+status:'Talk to '+last.name);
  tag.title=status||'';
 };
 window.addEventListener(FOX_STATUS_EVENT,(e:any)=>{
  const source=String(e.detail?.source||'work'),text=String(e.detail?.text||'').trim().slice(0,60);
  background.delete(source);if(text)background.set(source,text);render();
 });
 render();
 return {update(value:FoxTagState){last=value;render();}};
}
