import {node,textButton as button} from '../../components/index.ts';
import {ONGOING_KINDS,ongoingKindOf,ongoingLine,type OngoingTemplate,type OngoingThing} from '../../../core/ongoing/index.ts';

const el:(tag:string,cls?:string,text?:unknown)=>any=node;
// The thing to open next time the panel shows: one opened from the phone's Applet world.
let pending='';
export function requestOngoing(id:string){pending=typeof id==='string'?id:'';window.dispatchEvent(new CustomEvent('worldlet:ongoing-request',{detail:{id:pending}}));}
/** What Fox is asked from its panel: the conversation named, so Fox reads it from its past conversations; a thing of a
 * kind asks what that kind needs (core/ongoing kinds: the next workout, a quiz, the trip plan…). */
export const ongoingAsk=(thing:Pick<OngoingThing,'source'|'title'|'where'|'session'|'kind'>)=>{
 const kind=ongoingKindOf(thing);
 return kind==='general'?`Let's pick up “${thing.title}” (${thing.where}). Look at our past conversation “${thing.session}” and tell me where it stands and what comes next.`
  :`Let's pick up “${thing.title}” (${thing.where}). Look at our past conversation “${thing.session}” and ${ONGOING_KINDS[kind].ask}.`;
};

// Ongoing (core/ongoing/README.md): the conversations brought from other Agents that the person made into Applets.
// Each kept thing is a device of its own whose panel (`thing`) shows that conversation's latest turns; without one,
// the panel lists them all.
export function createOngoingApplet({native,ask=(_text:string)=>{},thing:only=''}:{native:any,ask?:(text:string)=>unknown,thing?:string}){
 const root=el('section','ongoing-applet');
 const status=el('p','ongoing-message');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
 const listView=el('div','ongoing-list'),openView=el('div','ongoing-open');openView.hidden=true;
 root.append(status,listView,openView);
 let kept:OngoingThing[]=[],selected:OngoingThing|null=null,visible=false;
 const api=body=>{if(!native?.ongoing)throw Error('Ongoing things live in your own world in the Worldlet app.');return native.ongoing(body);};
 const message=(text:string,error=false)=>{status.textContent=text;status.dataset.error=String(error);status.hidden=!text;};
 async function run(fn:()=>unknown){try{return await fn();}catch(e){message(e.message||String(e),true);return null;}}
 const now=()=>Date.now()/1000;

 function drawList(){
  listView.replaceChildren(el('p','ongoing-intro','Things you keep working on with your other Agents. After you bring an Agent, Fox suggests the conversations that look like one ongoing job; each one you keep has a place here and its own tile on your phone.'));
  if(!kept.length){listView.append(el('p','ongoing-empty','Nothing yet. Bring OpenClaw, Claude Code or another Agent in Settings, then keep what Fox suggests under Worth Doing.'));return;}
  const grid=el('div','ongoing-grid');
  for(const thing of kept){
   const card=button('',()=>run(()=>show(thing.id)),'ongoing-card');card.dataset.ongoing=thing.id;{const kind=ongoingKindOf(thing);if(kind!=='general'){card.dataset.kind=kind;card.style.borderLeftColor=ONGOING_KINDS[kind].color;}}
   card.append(el('strong','',thing.title),el('span','ongoing-card-line',ongoingLine(thing,now())));
   grid.append(card);
  }
  listView.append(grid);
 }
 async function show(id:string){
  const thing=kept.find(t=>t.id===id);if(!thing)throw Error('That is not in this world any more.');
  selected=thing;listView.hidden=true;openView.hidden=false;root.dataset.open='true';
  const head=el('div','ongoing-bar'),heading=el('div','ongoing-heading');
  heading.append(el('h2','',thing.title),el('p','ui-caption',ongoingLine(thing,now())));
  if(!only)head.append(button('‹ All ongoing',()=>close(),'ongoing-back'));
  head.append(heading);
  const actions=el('div','ongoing-actions');
  const kind=ongoingKindOf(thing);
  if(kind!=='general'){root.dataset.kind=kind;root.style.setProperty('--ongoing-accent',ONGOING_KINDS[kind].color);}else{delete root.dataset.kind;root.style.removeProperty('--ongoing-accent');}
  actions.append(button(kind==='general'?'Talk to Fox about this':ONGOING_KINDS[kind].action,()=>ask(ongoingAsk(thing)),'ongoing-ask'),button('Remove',()=>run(()=>remove(thing)),'ongoing-remove'));
  const page=el('section','ongoing-kind');page.hidden=true;
  const turns=el('ol','ongoing-turns');turns.setAttribute('aria-label','Latest messages');
  openView.replaceChildren(head,actions,page,turns);
  const result=await api({operation:'turns',id,limit:12,template:kind!=='general'});
  if(selected?.id!==id)return;
  if(result?.template)drawKind(page,result.template,thing);
  for(const turn of result?.turns||[]){
   const row=el('li','ongoing-turn');row.dataset.role=turn.role==='user'?'user':'agent';
   row.append(el('span','ongoing-turn-who',turn.role==='user'?'You':thing.where.split(' · ')[0]),el('p','',String(turn.text||'').slice(0,1200)));
   turns.append(row);
  }
  if(!turns.children.length)turns.append(el('li','ongoing-empty','No messages to show.'));
 }
 // The kind's page (core/ongoing kinds): its counts, then the person's own messages that belong in it, newest first.
 function drawKind(page:any,template:OngoingTemplate,thing:OngoingThing){
  page.hidden=false;page.dataset.kind=template.kind;
  const stats=el('dl','ongoing-stats');
  for(const stat of template.stats){const box=el('div','ongoing-stat');box.append(el('dt','',stat.label),el('dd','',stat.value));stats.append(box);}
  const log=el('ol','ongoing-log');log.setAttribute('aria-label',template.heading);
  for(const entry of template.entries){
   const row=el('li','ongoing-entry');
   const when=new Date(entry.at);
   row.append(el('time','ongoing-entry-at',Number.isNaN(when.getTime())?'':when.toLocaleDateString(undefined,{month:'short',day:'numeric'})));
   if(entry.value)row.append(el('strong','ongoing-entry-value',entry.value));
   row.append(el('span','ongoing-entry-text',entry.text));
   log.append(row);
  }
  if(!template.entries.length)log.append(el('li','ongoing-empty',template.empty));
  page.replaceChildren(el('h3','ongoing-kind-title',template.title+' · '+template.heading),stats,log,el('h3','ongoing-kind-title','Latest messages'));
 }
 function close(){selected=null;openView.hidden=true;listView.hidden=false;delete root.dataset.open;}
 async function remove(thing:OngoingThing){
  await api({operation:'decline',id:thing.id});
  if(!only)close();await load();message(`Removed “${thing.title}”. Fox will not suggest it again.`);
 }
 async function load(){
  const result=await api({operation:'list'});
  kept=Array.isArray(result?.kept)?result.kept:[];
  if(only){
   if(!kept.some(t=>t.id===only)){close();listView.replaceChildren(el('p','ongoing-empty','This is no longer kept. Fox will not suggest it again.'));return;}
   if(selected?.id!==only)await show(only);
   return;
  }
  if(selected&&!kept.some(t=>t.id===selected.id))close();
  drawList();
  if(pending&&visible){const id=pending;pending='';if(kept.some(t=>t.id===id))await show(id);}
 }
 window.addEventListener('worldlet:ongoing',()=>{if(visible)void run(load);});
 window.addEventListener('worldlet:ongoing-request',()=>{if(visible&&pending)void run(load);});
 drawList();
 return {element:root,show(){visible=true;message('');void run(load);},hide(){visible=false;}};
}
