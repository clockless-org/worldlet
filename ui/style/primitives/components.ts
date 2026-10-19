import {uiIcon} from './icons.ts';
export function node<K extends keyof HTMLElementTagNameMap>(tag: K,cls?: string,text?: unknown): HTMLElementTagNameMap[K];
export function node(tag: string,cls?: string,text?: unknown): HTMLElement;
export function node(tag: string,cls='',text?: unknown){return Object.assign(document.createElement(tag),{className:cls,...(text==null?{}:{textContent:String(text)})});}
export function textButton(text: unknown,run: (event: MouseEvent)=>unknown,cls=''){const b=node('button',cls,text);b.type='button';b.onclick=run;return b;}
export function actionButton({label,icon,run,variant='secondary',material='content',disabled=false,placement='contextual',slot}: {label: string;icon?: string;run?: ()=>unknown;variant?: string;material?: 'content'|'glass';disabled?: boolean;placement?: string;slot?: string}){
 const b=node('button','ui-button');b.type='button';b.dataset.variant=variant;b.dataset.placement=placement;if(slot)b.dataset.slot=slot;b.disabled=disabled;
 b.dataset.material=material;b.title=label;if(icon)b.innerHTML=uiIcon(icon);b.append(node('span','',label));
 b.onclick=async()=>{if(!run||b.disabled)return;try{const result: any=run();if(result?.then){b.disabled=true;b.setAttribute('aria-busy','true');await result;}}finally{b.disabled=disabled;b.removeAttribute('aria-busy');}};
 return b;
}
export function facts(entries){const list=node('dl','ui-facts');for(const [label,value]of entries){const item=node('div');item.append(node('dt','',label),node('dd','',value));list.append(item);}return list;}
export function notice(text,state='info'){const p=node('p','ui-notice',text);p.dataset.state=state;if(state==='error')p.setAttribute('role','alert');return p;}
export function choiceCard({title,description,details,selected,onChoose}){const card=node('section','ui-choice');card.dataset.selected=String(selected);card.append(node('h3','',title),node('p','',description),...details.map(t=>node('p','ui-caption',t)),actionButton({label:selected?'Selected':'Choose '+title,variant:selected?'secondary':'primary',disabled:selected,run:onChoose}));return card;}

/** Default content shell for built-in and generated Applets. Decoration never owns text. */
export function appletSurface({title,subtitle=''}:{title:string;subtitle?:string}){
 const element=node('section','ui-pane ui-applet-surface'),header=node('header','ui-applet-header');
 const heading=node('h2','ui-title',title),meta=node('p','ui-caption',subtitle);header.append(heading,meta);
 const body=node('div','ui-applet-body'),footer=node('footer','ui-applet-footer');element.append(header,body,footer);
 return {element,header,heading,meta,body,footer};
}
export function emptyState(title:string,description=''){
 const element=node('div','ui-empty-state');element.append(node('h3','',title),node('p','ui-caption',description));return element;
}

export function taskMarker(state='needsAction',icon='file'){
 const marker=node('span','world-task-marker');marker.dataset.state=state;marker.setAttribute('aria-hidden','true');if(state==='unseen'||state==='event')marker.innerHTML=uiIcon(icon);return marker;
}
export function taskRow({title,objective,label,active=false,state='needsAction',icon='file',when=null,run}){
 const row=node('button','world-task');row.type='button';row.dataset.state=state;row.setAttribute('aria-current',active?'location':'false');row.setAttribute('aria-label',(state==='matter'?'Matter: ':state==='event'?'Event: ':state==='unseen'?'Update: ':'Task: ')+label+(when?', '+when.label:''));row.title=title+' · '+objective;
 const marker=taskMarker(state,icon);
 const copy=node('span','world-task-copy'),head=node('span','world-task-head');
 head.append(node('strong','world-task-title',title));
 // The time leads the key-facts line under the title (owner decision 2026-10-02, #1281), so the
 // title keeps its full width; its full timing stays in the tooltip and the card.
 const facts=node('span','world-task-objective');
 if(when){const time=node('span','world-task-time',when.factor??when.relative);time.title=when.label;facts.append(time);if(objective)facts.append(node('span','world-task-time-separator',' · '));}
 if(objective)facts.append(document.createTextNode(objective));
 copy.append(head,facts);row.append(marker,copy);row.onclick=run;return row;
}
