import {canRenderWorld,createWebClient,createRoomWebClient,isRoomLink,worldLinkFromWeb,WebPairingEnded,type WorldDevice,type WebClient,type WebMessage,type WebView,type PhoneAttentionItem,type PhoneTask,type RoomSocketFactory} from '../../core/phone/index.ts';

// Worldlet in a web browser (core/phone/README.md#web): the page the relay serves at /open/ pairs with the computer
// like the phone apps, from the link the computer's Mobile page makes, and shows what the phones show: what needs
// the person (the Attention Center's Now and Later), what the Agent is doing (the Task panel), today's Journal and
// Fox's conversation. The computer does all the work; this page only shows what it sends and passes back what the person
// does. The link stays in this browser's storage (never sent anywhere: it is the URL fragment), so a reload or a
// bookmark of /open/ keeps working until the computer turns the link off.
export const WEB_LINK_KEY='worldlet-web-link';
/** The person chose the Center here over the full World (`1`). */
export const WEB_SIMPLE_KEY='worldlet-web-simple';
type Tab='now'|'working'|'today'|'fox';
const TABS:[Tab,string][]=[['now','Needs you'],['working','Working'],['today','Today'],['fox','Fox']];
const GROUPS:Record<string,string>={event:'Coming up',needsAction:'Worth doing',unseen:'Worth knowing'};
export type WebOpenOptions={fetch:typeof fetch,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,location:{hash:string,origin:string},
 replaceURL:(url:string)=>void,version:string,userAgent:string,wait?:number,retry?:number,WebSocket?:RoomSocketFactory,
 /** What this device can draw, and how to go to the full World (core/phone/world-room.ts): a link that carries the
  * World's pairing opens it on a device that can draw it, and keeps the Center here on one that cannot. */
 device?:WorldDevice,openWorld?:(url:string)=>void,
 /** `/open/?simple`: the person wants the Center here, not the full World; kept for this browser. */
 simple?:boolean};

/** "Chrome on Mac": what the computer's Mobile page calls this browser. */
export function browserName(userAgent:string){
 const browser=/Edg\//.test(userAgent)?'Edge':/Firefox\//.test(userAgent)?'Firefox':/Chrome\//.test(userAgent)?'Chrome':/Safari\//.test(userAgent)?'Safari':'a browser';
 const system=/iPhone|iPad/.test(userAgent)?'iPhone':/Android/.test(userAgent)?'Android':/Mac OS X/.test(userAgent)?'Mac':/Windows/.test(userAgent)?'Windows':/Linux/.test(userAgent)?'Linux':'';
 return system?`${browser} on ${system}`:browser;
}

/** Whether the relay serves the World bundle a World link names: a version it does not keep (or a relay with no
 * bundle yet) answers otherwise, and the person stays on the Center instead of a page that is not there. */
export async function worldAnswers(fetcher:(input:string,init?:RequestInit)=>Promise<Response>,url:string):Promise<boolean>{
 try{const response=await fetcher(new URL(url).pathname,{method:'HEAD',cache:'no-store',redirect:'follow'});return response.ok&&/^text\/html\b/i.test(response.headers.get('content-type')||'');}
 catch{return false;}
}

export function mountWebOpen(root:HTMLElement,options:WebOpenOptions){
 const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 // A fresh link arrives in the fragment; it is kept and taken out of the address bar at once.
 if(/(^#|&)s=/.test(options.location.hash)){options.storage.setItem(WEB_LINK_KEY,options.location.hash.slice(1));options.replaceURL('/open/');}
 const saved=options.storage.getItem(WEB_LINK_KEY);
 if(options.simple)try{options.storage.setItem(WEB_SIMPLE_KEY,'1');}catch{}
 // The full World, where the link carries it and this device can draw it, unless the person chose the Center here.
 const world=saved&&isRoomLink(saved)?worldLinkFromWeb(saved,options.location.origin):'';
 const openWorld=()=>{try{options.storage.removeItem(WEB_SIMPLE_KEY);}catch{}options.openWorld?.(world);};
 if(world&&options.openWorld&&options.device&&canRenderWorld(options.device)&&options.storage.getItem(WEB_SIMPLE_KEY)!=='1'){openWorld();return {stop(){},get view(){return {} as WebView;}};}
 let client:WebClient|null=null,view:WebView={},tab:Tab='now',notice='',ended=false,stopped=false,draft='';
 const pending=new Set<string>();
 try{if(saved){
  // A link with `m=room` meets the computer in the pairing room (core/phone room.ts), where nothing is stored; an older
  // one reads the relay's slots.
  const base={link:saved,relay:options.location.origin,name:browserName(options.userAgent),version:options.version};
  client=isRoomLink(saved)?createRoomWebClient({...base,...(options.WebSocket?{WebSocket:options.WebSocket}:{})}):createWebClient({...base,fetch:options.fetch});
 }}
 catch(e){notice=(e as Error).message;options.storage.removeItem(WEB_LINK_KEY);}
 const send=async(message:WebMessage)=>{
  if(!client)return;
  try{await client.send(message);notice='';}catch(e){notice=e instanceof WebPairingEnded?e.message:'Could not reach your computer. Try again.';if(e instanceof WebPairingEnded)end();}
  render();
 };
 const id=()=>Math.random().toString(36).slice(2,12);
 const button=(label:string,run:()=>void,primary=false)=>{const b=el('button',primary?'primary':'',label);b.type='button';b.onclick=run;return b;};
 function item(row:PhoneAttentionItem){
  const card=el('article','web-item');card.dataset.group=row.group;
  card.append(el('h3','',row.action||row.title));
  const meta=[row.fact||row.when,row.source].filter(Boolean).join(' · ');if(meta)card.append(el('p','web-meta',meta));
  if(row.context)card.append(el('p','',row.context));
  if(row.summary)card.append(el('p','web-summary',row.summary));
  if(row.fox?.say)card.append(el('p','web-fox',row.fox.say));
  const actions=el('div','web-actions'),settle=(action:'done'|'later')=>{pending.add(row.id);void send({type:'attention',id:row.id,action});render();};
  actions.append(button(row.group==='needsAction'?'Done':'Got it',()=>settle('done'),true));
  if(!row.snoozed)actions.append(button('Later',()=>settle('later')));
  if(row.fox?.option)actions.append(button(row.fox.option,()=>void send({type:'option',id:id(),item:row.id})));
  card.append(actions);
  return card;
 }
 function needsYou(){
  const page=el('section','web-page'),attention=view.attention;
  if(!attention){page.append(el('p','web-empty','Waiting for your computer…'));return page;}
  for(const account of attention.accounts)page.append(el('p','web-account',`Connect ${account.title} on your computer`));
  const now=attention.now.filter(r=>!pending.has(r.id)),later=attention.later.filter(r=>!pending.has(r.id));
  if(!now.length)page.append(el('p','web-empty','Nothing needs you right now.'));
  for(const group of Object.keys(GROUPS)){
   const rows=now.filter(r=>r.group===group);if(!rows.length)continue;
   page.append(el('h2','',GROUPS[group]),...rows.map(item));
  }
  if(later.length)page.append(el('h2','','Later'),...later.map(item));
  return page;
 }
 function task(row:PhoneTask){
  const card=el('article','web-task');
  card.append(el('h3','',row.name),el('p','web-meta',[row.when,row.every,row.by].filter(Boolean).join(' · ')));
  if(row.status)card.append(el('p','',row.status));
  if(typeof row.progress==='number'){const bar=el('progress','');bar.max=1;bar.value=row.progress;card.append(bar);}
  for(const line of row.lines??[])card.append(el('p','web-line',line));
  return card;
 }
 function working(){
  const page=el('section','web-page'),tasks=view.attention?.tasks;
  if(!tasks){page.append(el('p','web-empty','Waiting for your computer…'));return page;}
  page.append(el('h2','','Doing now'),...(tasks.now.length?tasks.now.map(task):[el('p','web-empty','Nothing running right now.')]));
  if(tasks.routines.length)page.append(el('h2','','Routines'),...tasks.routines.map(task));
  return page;
 }
 function today(){
  const page=el('section','web-page'),journal=view.attention?.journal;
  if(!journal?.length){page.append(el('p','web-empty','Nothing in today’s Journal yet.'));return page;}
  for(const entry of journal){
   const card=el('article','web-journal');
   card.append(el('h3','',entry.title),el('p','web-meta',new Date(entry.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(entry.category?' · '+entry.category:'')));
   if(entry.text)card.append(el('p','',entry.text));
   page.append(card);
  }
  return page;
 }
 function fox(){
  const page=el('section','web-page web-fox-page'),conversation=view.conversation,live=view.live;
  const list=el('div','web-turns');
  for(const turn of conversation?.messages??[])list.append(el('p','web-turn '+turn.role,turn.text));
  if(live&&!live.done&&!live.item&&!live.applet){
   const turn=el('p','web-turn fox working',live.text||live.steps.at(-1)||'Working…');list.append(turn);
  }
  if(live?.approval&&!live.done){
   const ask=el('div','web-approval'),a=live.approval;
   ask.append(el('h3','',a.title),el('p','',a.detail),...a.choices.map(choice=>button(choice==='once'?'Allow once':choice==='always'?'Always':'Deny',()=>void send({type:'approval',id:id(),approval:a.id,choice}),choice==='once')));
   list.append(ask);
  }
  if(!list.childElementCount)list.append(el('p','web-empty',`Say something to ${conversation?.name||'Fox'}.`));
  const form=el('form','web-say'),input=el('input','');input.placeholder=`Message ${conversation?.name||'Fox'}`;input.value=draft;input.oninput=()=>{draft=input.value;};
  form.append(input,button('Send',()=>form.requestSubmit(),true));
  form.onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(!text)return;draft='';void send({type:'chat',id:id(),text});};
  page.append(list,form);
  return page;
 }
 function render(){
  const header=el('header','web-header');
  header.append(el('h1','','Worldlet'),el('p','web-computer',client?(view.desktop?.name||client.computer||'Your computer'):''));
  if(world&&options.openWorld&&client&&!ended)header.append(button('Open the full World',openWorld));
  if(!client||ended){
   const page=el('section','web-page web-start');
   page.append(el('h2','',ended?'This link is off':'Open Worldlet here'),
    el('p','',notice||'On your computer, open Worldlet, then Fox’s panel › Mobile › In a browser, and choose Open in browser or Copy link.'));
   root.replaceChildren(header,page);return;
  }
  const nav=el('nav','web-tabs');
  for(const [key,label] of TABS){
   const b=button(label+(key==='now'&&view.attention?` ${view.attention.now.filter(r=>!pending.has(r.id)).length||''}`.trimEnd():''),()=>{tab=key;render();});
   b.setAttribute('aria-pressed',String(tab===key));nav.append(b);
  }
  const body=tab==='now'?needsYou():tab==='working'?working():tab==='today'?today():fox();
  const status=el('p','web-notice',notice);status.setAttribute('role','status');status.hidden=!notice;
  const focused=document.activeElement instanceof HTMLInputElement&&root.contains(document.activeElement);
  root.replaceChildren(header,nav,status,body);
  if(focused)(root.querySelector('.web-say input') as HTMLInputElement|null)?.focus();
 }
 function end(){ended=true;stopped=true;options.storage.removeItem(WEB_LINK_KEY);}
 async function loop(){
  let shown='';
  while(client&&!stopped){
   const began=Date.now();
   try{
    const next=await client.poll(view.desktop?options.wait??20:0),text=JSON.stringify(next);
    // A settled item leaves the pending set with the computer's next Center.
    if(next.attention!==view.attention)pending.clear();
    view=next;
    if(text!==shown||notice){shown=text;notice='';render();}
    // A relay that answers at once (nothing to wait for) is asked again a second later, not in a tight loop.
    else if(Date.now()-began<1000)await new Promise(resolve=>setTimeout(resolve,1000));
   }catch(e){
    if(e instanceof WebPairingEnded){notice=e.message;end();render();return;}
    notice='Your computer is not reachable. Worldlet shows what it last sent.';render();
    await new Promise(resolve=>setTimeout(resolve,options.retry??5000));
   }
  }
 }
 render();void loop();
 return {stop(){stopped=true;},get view(){return view;}};
}
