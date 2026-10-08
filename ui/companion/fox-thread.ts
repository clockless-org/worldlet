/** One conversation with Fox across every place, shown place by place.
 * Hermes keeps a single session for the whole world, so a question asked in one place can be
 * about another. Each entry here is one turn tagged with the place (segment) it was asked
 * in; each context shows only its own segment (one visible thread per context). A turn is one card:
 * it shows Fox's steps while it works and becomes the answer when it finishes. */
import {addHarnessUsage,harnessUsageLabel,legacyActionDisplayText,readHarnessUsage} from '../../core/agent/index.ts';
import type {HarnessUsage} from '../../contracts/harness-services.ts';
import {conversationTopics} from '../../core/companion/index.ts';
import {contextThread} from '../attention/index.ts';
import {uiIcon} from '../components/index.ts';

export type ThreadStatus='working'|'done'|'error';
/** `userIcon` marks a question the person asked with an action or a choice: its icon shows before
 * the action's title or the choice's name, never the prompt behind it. `usage`: what the turn used, as the person's
 * Agent reported it (contracts/harness-services.ts HarnessUsage). */
export type ThreadEntry={id:string;key:string;view:string;location:string;user:string;userIcon?:string;text:string;steps:string[];status:ThreadStatus;at:number;usage?:HarnessUsage};
export const THREAD_ROW='fox-thread';
const MAX_ENTRIES=120,MAX_STEPS=12,MAX_TEXT=4000,ICON=/^[a-z][a-z0-9-]{0,31}$/;

export const segmentOf=(entry:{key:string;view:string})=>contextThread(entry.key,entry.view);
export function threadStart(entries:ThreadEntry[],entry:Omit<ThreadEntry,'text'|'steps'|'status'>):ThreadEntry[]{
 return [...entries,{...entry,user:entry.user.slice(0,MAX_TEXT),text:'',steps:[],status:'working' as const}].slice(-MAX_ENTRIES);
}
/** A Fox line said before a turn (a place's greeting, a welcome back): once the person
 * answers it, it belongs to the conversation, as a card with no question. */
export function threadLine(entries:ThreadEntry[],line:{id:string;key:string;view:string;location:string;text:string;at:number}):ThreadEntry[]{
 return [...entries,{...line,user:'',text:line.text.slice(0,MAX_TEXT),steps:[],status:'done' as const}].slice(-MAX_ENTRIES);
}
export function threadStep(entries:ThreadEntry[],id:string,step:string):ThreadEntry[]{
 const label=String(step||'').replace(/(?:…|\.{3})$/u,'').trim().slice(0,160);
 return entries.map(e=>e.id!==id||!label||e.steps.at(-1)===label?e:{...e,steps:[...e.steps,label].slice(-MAX_STEPS)});
}
export function threadFinish(entries:ThreadEntry[],id:string,text:string,status:ThreadStatus='done',usage?:unknown):ThreadEntry[]{
 const used=readHarnessUsage(usage);
 return entries.map(e=>e.id!==id?e:{...e,text:String(text||'').slice(0,MAX_TEXT),status,...used?{usage:used}:{}});
}
/** What this place's thread used so far, as one quiet line ("12k tokens"), and its turns' sum; empty when the Agent
 * reported nothing. */
export function threadUsage(entries:ThreadEntry[],segment:string):{label:string;usage:HarnessUsage|null}{
 const usage=entries.filter(e=>e.usage&&segmentOf(e)===segment).reduce<HarnessUsage|null>((sum,e)=>addHarnessUsage(sum,e.usage!),null);
 return {label:harnessUsageLabel(usage),usage};
}
/** A message added to a running turn (steering) is the newest thing the person said, so it heads the
 * working card; the question it followed stays above as a card of its own, the person's line with no answer.
 * Before, the card kept showing the first question and the new message showed nowhere: sending a second
 * message brought the previous one back to the front (owner Order 2026-10-07). */
export function threadSteer(entries:ThreadEntry[],id:string,line:{user:string;at:number}):ThreadEntry[]{
 const i=entries.findIndex(e=>e.id===id&&e.status==='working'),user=String(line.user||'').trim();
 if(i<0||!user)return entries;
 const {userIcon:_,...entry}=entries[i],asked:ThreadEntry={...entries[i],id:entry.id+':asked:'+line.at,text:'',steps:[],status:'done'};
 return [...entries.slice(0,i),asked,{...entry,user:user.slice(0,MAX_TEXT),at:line.at},...entries.slice(i+1)].slice(-MAX_ENTRIES);
}
/** A turn that ended without an answer (stopped, superseded or failed) stops showing as live; a finished one is kept. */
export function threadInterrupt(entries:ThreadEntry[],id:string,text:string):ThreadEntry[]{
 return entries.some(e=>e.id===id&&e.status==='working')?threadFinish(entries,id,text,'error'):entries;
}
/** A turn still marked working after a restart was interrupted; never show it as live. */
export function restoreThread(rows:unknown):ThreadEntry[]{
 const row=Array.isArray(rows)?rows.find(r=>r?.key===THREAD_ROW):null,list=Array.isArray(row?.entries)?row.entries:[];
 return list.slice(-MAX_ENTRIES).flatMap((e:any)=>{
  if(!e||typeof e.id!=='string'||typeof e.key!=='string'||typeof e.view!=='string'||typeof e.user!=='string'||typeof e.text!=='string')return [];
  const status:ThreadStatus=e.status==='done'?'done':e.status==='error'||e.status==='working'?'error':'done',usage=readHarnessUsage(e.usage);
  return [{id:e.id.slice(0,120),key:e.key.slice(0,500),view:e.view.slice(0,500),location:String(e.location||'').slice(0,160),user:(row.userTextVersion===undefined?legacyActionDisplayText(e.user)??e.user:e.user).slice(0,MAX_TEXT),...typeof e.userIcon==='string'&&ICON.test(e.userIcon)?{userIcon:e.userIcon}:{},
   text:e.status==='working'&&!e.text?'This reply was interrupted. You can ask again.':e.text.slice(0,MAX_TEXT),
   steps:(Array.isArray(e.steps)?e.steps:[]).filter((s:unknown)=>typeof s==='string').slice(-MAX_STEPS).map((s:string)=>s.slice(0,160)),status,at:Number(e.at)||0,...usage?{usage}:{}}];
 });
}
export const threadRow=(entries:ThreadEntry[])=>({key:THREAD_ROW,userTextVersion:1,view:'',text:'',entries:entries.slice(-MAX_ENTRIES)});

/** What the stack above the bubble shows: this place's earlier finished turns, and a message the
 * person added to a turn (its question with no answer of its own, threadSteer). */
export function threadCards(entries:ThreadEntry[],segment:string,{exclude=''}:{exclude?:string}={}){
 return entries.filter(e=>e.id!==exclude&&e.status!=='working'&&(!!e.text||!!e.user)&&segmentOf(e)===segment);
}

/** The working card's body: one plain line, the step Fox is on now (the question is shown
 * separately on the card). */
export function workingText(entry:ThreadEntry,current:string){
 const step=entry.steps.at(-1)||String(current||'Getting ready').replace(/(?:…|\.{3})$/u,'');
 return step.replace(/[\\`*_[\]<>#|]/g,'')+'…';
}

/** Earlier turns, oldest first, grouped by topic (owner Order 2026-10-08, core/companion/conversation-topics.ts).
 * A topic of one turn is a plain card: the question and its answer. A topic of several turns is one stack
 * showing its newest turn under the topic's name and count, with card edges behind it; its name opens it into
 * its turns' cards and closes it again. `open` holds the opened topics' ids; `answer` renders an answer's Markdown. */
export function threadTopicKey(cards:ThreadEntry[]){return conversationTopics(cards).map(t=>t.id+':'+t.turns.length).join(',');}
export function renderThreadCards(list:HTMLElement,cards:ThreadEntry[],{answer,open=new Set<string>(),toggle}:{answer:(entry:ThreadEntry)=>Node;open?:ReadonlySet<string>;toggle?:(topic:string)=>void}){
 const make=(entry:ThreadEntry)=>{
  const card=document.createElement('article');card.className='companion-thread-card';card.dataset.status=entry.status;card.dataset.entry=entry.id;
  // What the turn used, on hover only: the thread's total stands quietly under the cards (threadUsage).
  const used=harnessUsageLabel(entry.usage??null,{detail:true});if(used)card.title='This reply: '+used;
  // A Fox line said before a turn has no question.
  if(entry.user){const asked=document.createElement('p');asked.className='companion-thread-user';showQuestion(asked,entry);card.append(asked);}
  if(entry.text){const said=document.createElement('div');said.className='companion-thread-reply';said.append(answer(entry));card.append(said);}
  return card;
 };
 const head=(topic:{id:string;title:string;turns:ThreadEntry[]},opened:boolean)=>{
  const button=document.createElement('button');button.type='button';button.className='companion-topic-head';
  button.setAttribute('aria-expanded',String(opened));button.dataset.topic=topic.id;
  const name=document.createElement('span');name.className='companion-topic-name';name.textContent=topic.title;
  const count=document.createElement('span');count.className='companion-topic-count';count.textContent=opened?'Fold':String(topic.turns.length);
  button.append(name,count);
  button.setAttribute('aria-label',opened?`Fold “${topic.title}” to its latest message`:`Open “${topic.title}”, ${topic.turns.length} messages`);
  button.addEventListener('click',e=>{e.stopPropagation();toggle?.(topic.id);});
  return button;
 };
 const shown:HTMLElement[]=[];
 for(const topic of conversationTopics(cards)){
  if(topic.turns.length===1){shown.push(make(topic.turns[0]));continue;}
  if(open.has(topic.id)){
   const cardsOfTopic=topic.turns.map(make);cardsOfTopic[0].prepend(head(topic,true));
   for(const card of cardsOfTopic){card.dataset.topic=topic.id;shown.push(card);}
   continue;
  }
  const card=make(topic.turns.at(-1)!);card.classList.add('is-topic-stack');card.dataset.topic=topic.id;card.dataset.count=String(topic.turns.length);
  card.prepend(head(topic,false));shown.push(card);
 }
 // Older cards fade further.
 shown.forEach((card,i)=>card.style.setProperty('--age',String(shown.length-1-i)));
 list.replaceChildren(...shown);
}
/** The person's line on a card: the action's or choice's icon, then its title or the text asked. */
export function showQuestion(element:HTMLElement,entry:{user?:string;userIcon?:string}|null){
 const text=entry?.user||'',icon=text&&entry?.userIcon&&ICON.test(entry.userIcon)?entry.userIcon:'',key=icon+'\u0000'+text;
 element.hidden=!text;if(element.dataset.question===key)return;element.dataset.question=key;element.replaceChildren();
 if(icon){const mark=document.createElement('span');mark.className='companion-user-icon';mark.innerHTML=uiIcon(icon);element.append(mark);}
 element.append(document.createTextNode(text));
}
