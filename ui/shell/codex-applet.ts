import {localPathName} from '../../core/context/index.ts';
// Codex owns conversation history and execution. Only the selected session gets
// the user's next Fox message; no Hermes prompt or unrelated world data is sent.
export function createCodexApplet({call,renderMarkdown,onSelect,onState,onRequest,onRequestDone,isVisible}){
 const el=(tag: string,text='',cls=''): any=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
 const button=(text,run)=>{const b=el('button',text,'app-device-row');b.type='button';b.onclick=run;return b;};
 const host=el('section','','app-device-inventory codex-device');host.setAttribute('aria-label','Codex sessions');
 const list=el('div','','session-rows'),search=el('input'),status=el('p','','ui-caption'),summary=el('div','','codex-summary');
 search.type='search';search.placeholder='Find a session or project';search.setAttribute('aria-label',search.placeholder);search.oninput=drawRows;
 const head=el('div','','app-device-head');head.append(el('h2','Codex'),button('Refresh',()=>refresh()));host.append(head,summary,search,list,status);
 let pins=new Set();function readPins(){try{const saved=JSON.parse(localStorage.getItem('worldlet-session-pins-v1')||'[]');if(Array.isArray(saved))pins=new Set(saved.filter(v=>typeof v==='string').slice(0,200));}catch{}}readPins();
 let pinnedOnly=false;const pinFilter=button('Show pinned',()=>{pinnedOnly=!pinnedOnly;pinFilter.textContent=pinnedOnly?'Show all sessions':'Show pinned';drawRows();});head.append(pinFilter);
 let usage=null,usageReadAt=0;
 let error='',sessions=[],selected=null,cursor=null,busy=false,reader=null,historyCursor=null,readSerial=0;
 const running=new Map(),requests=new Map(),items=new Map();
 function publish(){onState({sessions,usage,selected:selected?.sessionId,cursor,error,scope:'Live states apply to sessions running in Worldlet. Other sessions are saved history.'});drawRows();}
 function setStatus(id,state){const row=sessions.find(s=>s.sessionId===id);if(row)row.status=state;if(selected?.sessionId===id)selected.status=state;publish();}
 function drawRows(){
  const query=search.value.toLowerCase(),rows=sessions.filter(s=>(!pinnedOnly||pins.has(s.id))&&(s.title+' '+s.cwd).toLowerCase().includes(query));list.replaceChildren();
  const counts=['Running','Waiting for you','Completed'].map(state=>[state,sessions.filter(s=>s.status===state).length]);
  summary.replaceChildren(...counts.map(([state,count])=>{const s=el('span',`${count} ${state}`,'codex-count');s.dataset.state=state;return s;}));
  list.append(el('p',`${rows.length} shown · ${sessions.length} loaded`,'ui-caption'));
  for(const s of rows){const row=button('',()=>onSelect(s));row.dataset.sessionId=s.sessionId;row.classList.add('codex-session-row');row.setAttribute('aria-label',s.title);row.setAttribute('aria-current',String(selected?.sessionId===s.sessionId));
   const light=el('span','','codex-state-light');light.dataset.state=s.status;light.setAttribute('aria-hidden','true');
   const copy=el('span','','codex-session-copy');copy.append(el('strong',s.title),el('small',`${localPathName(s.cwd)||'No project'} · ${s.status}`));row.append(light,copy);const wrap=el('div','','session-row');const pin=button(pins.has(s.id)?'★':'☆',()=>{readPins();pins.has(s.id)?pins.delete(s.id):pins.add(s.id);try{localStorage.setItem('worldlet-session-pins-v1',JSON.stringify([...pins]));}catch{}drawRows();});pin.setAttribute('aria-label',(pins.has(s.id)?'Unpin ':'Pin ')+s.title);wrap.append(row,pin);list.append(wrap);}
  if(!rows.length&&!busy)list.append(el('p','No saved sessions found. Start a session in Codex, then refresh.','ui-caption'));
  if(cursor)list.append(button('Load more sessions',()=>refresh(true)));
 }
 async function refresh(more=false,background=false){if(busy)return;busy=true;error='';status.removeAttribute('role');status.textContent='Reading local Codex sessions…';try{
  if(Date.now()-usageReadAt>60000){usageReadAt=Date.now();void call({operation:'usage'}).then(value=>{usage={...value,observedAt:Date.now()};publish();}).catch(()=>{usage=null;publish();});}
  const result=await call({operation:'list',...(more&&cursor?{cursor}:{})}),rows=result.providers?.find(p=>p.provider==='codex')?.sessions||[];
  sessions=background?[...new Map([...rows,...sessions.filter(s=>!rows.some(r=>r.sessionId===s.sessionId))].map(s=>[s.sessionId,s])).values()]:more?[...new Map([...sessions,...rows].map(s=>[s.sessionId,s])).values()]:rows;
  if(!background)cursor=result.nextCursor;status.textContent=result.scope||'Live states apply to Worldlet sessions; other sessions are saved history.';publish();
 }catch(e){error=e.message;status.textContent=e.message;status.setAttribute('role','alert');publish();}finally{busy=false;drawRows();}}
 async function inspect(session,container,older=false){
  selected=session;reader=container;const serial=++readSerial;
  if(!older)container.replaceChildren(el('p','Loading conversation…','ui-caption'));
  publish();
  try{const result=await call({operation:'read',threadId:session.sessionId,...older&&historyCursor?{cursor:historyCursor}:{}});if(serial!==readSerial||!container.isConnected)return;
   historyCursor=result.nextCursor;selected={...session,...result.session};if(!older)container.replaceChildren();
   const fragment=el('section','','codex-history');
   if(historyCursor)fragment.append(button('Earlier messages',()=>inspect(selected,container,true)));
   for(const turn of [...(result.turns||[])].reverse()){
    const section=el('section','','codex-turn');section.dataset.turnId=turn.id;
    for(const item of turn.items||[]){
     if(item.type==='userMessage'||item.type==='agentMessage'){
      const text=item.type==='agentMessage'?item.text:(item.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(!text)continue;
      const message=el('article','','codex-message');message.append(el('h3',item.type==='userMessage'?'You':'Codex'));message.append(renderMarkdown(text,{title:'Session message',path:'session.md'}));section.append(message);
     }else if(item.type==='commandExecution'||item.type==='fileChange'){
      const details=el('details','','codex-tool');details.append(el('summary',(item.type==='commandExecution'?'Command':'Files')+' · '+(item.status||'')));
      details.append(el('pre',String(item.command?[item.command,item.aggregatedOutput].filter(Boolean).join('\n\n'):item.changes?.map(c=>c.path+'\n'+(c.diff||'')).join('\n')||'').slice(0,20000)));section.append(details);
     }
    }
    if(turn.error?.message)section.append(el('p',turn.error.message,'app-device-error'));
    if(section.children.length)fragment.append(section);
   }
   if(older){container.querySelector('.codex-history>button')?.remove();container.prepend(fragment);}else container.append(fragment);
   container.querySelector('.codex-session-hint')?.remove();container.append(el('p','Message Fox below to continue this Codex session.','codex-session-hint'));publish();
  }catch(e){if(serial===readSerial)container.replaceChildren(el('p',e.message,'app-device-error'));}
 }
 function showPending(){const r=[...requests.values()].find(r=>r.threadId===selected?.sessionId);if(r&&isVisible())onRequest(requestUI(r));}
 function requestDone(){onRequestDone();showPending();}
 function requestUI(request){
  const {requestId,kind,details,threadId}=request,body=el('section','','codex-request');body.setAttribute('aria-label','Codex needs your input');
  body.append(el('strong','Codex needs your input'));
  const fields=[];
  if(kind==='item/tool/requestUserInput')for(const q of details.questions||[]){
   const label=el('label',q.question),input=el('input');input.setAttribute('aria-label',q.question);label.append(input);body.append(label);fields.push({id:q.id,input});
   for(const o of q.options||[])body.append(button(o.label,()=>{input.value=o.label;}));
  }else{body.append(el('p',details.reason||'Review this operation before allowing it.'));const item=items.get(threadId+':'+details.itemId);const preview=details.command||item?.command||item?.changes?.map(c=>c.path+'\n'+(c.diff||'')).join('\n');body.append(el('pre',preview||details.grantRoot||'No change preview was supplied by Codex. Decline if you cannot verify this operation.'));if(details.cwd)body.append(el('small',details.cwd));}
  // Native hosts own requestId for their own reply correlation; Codex's key travels as serverRequestId.
  async function answer(decision?: string){try{await call({operation:'respond',threadId,serverRequestId:requestId,...fields.length?{answers:Object.fromEntries(fields.map(f=>[f.id,{answers:[f.input.value]}]))}:{decision}});requests.delete(requestId);requestDone();}catch(e){body.append(el('p',e.message,'app-device-error'));}}
  if(fields.length)body.append(button('Send answers',()=>answer()));else body.append(button('Allow once',()=>answer('accept')),button('Decline',()=>answer('decline')));
  return body;
 }
 function events(event){
  const p=event.params||{},id=p.threadId;
  if(['item/started','item/completed'].includes(event.method)&&p.item){items.set(id+':'+p.item.id,p.item);
   if(p.item.type==='commandExecution'){
    const row=sessions.find(s=>s.sessionId===id);if(row){row.activity=event.method==='item/started'?p.item.command:'';publish();}
    if(selected?.sessionId===id&&reader?.isConnected){let tool=reader.querySelector('.codex-current-tool');if(!tool){tool=el('details','','codex-tool codex-current-tool');tool.open=true;tool.append(el('summary'),el('pre'));reader.append(tool);}tool.querySelector('summary').textContent='Command · '+(p.item.status||'running');tool.querySelector('pre').textContent=[p.item.command,p.item.aggregatedOutput].filter(Boolean).join('\n\n').slice(-20000);}
   }
  }
  if(event.method==='item/commandExecution/outputDelta'&&selected?.sessionId===id&&reader?.isConnected){const pre=reader.querySelector('.codex-current-tool pre');if(pre)pre.textContent=(pre.textContent+(p.delta||'')).slice(-20000);}
  if(event.method==='worldlet/disconnected'){requests.clear();onRequestDone();for(const r of running.values())r.reject(Error('Codex disconnected. Refresh the Applet to reconnect.'));running.clear();for(const s of sessions)if(['Running','Waiting for you'].includes(s.status))s.status='Unknown';publish();return;}
  if(event.method==='worldlet/request'){requests.set(p.requestId,p);setStatus(id,'Waiting for you');if(isVisible()&&selected?.sessionId===id)onRequest(requestUI(p));return;}
  if(event.method==='serverRequest/resolved'){requests.delete(String(p.requestId));requestDone();return;}
  if(event.method==='turn/started')setStatus(id,'Running');
  if(event.method==='thread/status/changed'&&p.status?.type==='active')setStatus(id,p.status.activeFlags?.length?'Waiting for you':'Running');
  const run=running.get(id);
  if(event.method==='item/agentMessage/delta'&&run){run.text+=p.delta||'';run.onDelta?.(run.text);if(selected?.sessionId===id&&reader?.isConnected){let live=reader.querySelector('.codex-stream');if(!live){live=el('pre','','codex-stream');reader.append(live);}live.textContent=run.text;}}
  if(event.method==='turn/completed'){
   setStatus(id,({completed:'Completed',interrupted:'Stopped',failed:'Failed'})[p.turn?.status]||'Idle');
   for(const [key,req]of requests)if(req.threadId===id)requests.delete(key);requestDone();
   if(run){running.delete(id);if(p.turn?.status==='failed')run.reject(Error(p.turn.error?.message||'Codex could not complete this turn.'));else run.resolve({message:run.text||(p.turn?.status==='interrupted'?'Codex stopped.':'Codex finished this turn.')});}
   if(selected?.sessionId===id&&reader?.isConnected)void inspect(selected,reader);
  }
 }
 window.worldletCodexEvent=events;
 async function run(text: string,{signal,onDelta}: any={}){
  const session=selected;if(!session)throw Error('Choose a Codex session first.');const id=session.sessionId;
  if(running.has(id))throw Error('This session is already running.');signal?.throwIfAborted();
  let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});done.catch(()=>{});
  const entry={text:'',onDelta,resolve,reject};running.set(id,entry);setStatus(id,'Running');
  const abort=()=>{void call({operation:'interrupt',threadId:id}).catch(()=>{});reject(new DOMException('Stopped','AbortError'));};signal?.addEventListener('abort',abort,{once:true});
  try{await call({operation:'send',threadId:id,text});signal?.throwIfAborted();return await done;}
  catch(e){if(running.get(id)===entry){running.delete(id);setStatus(id,e.name==='AbortError'?'Stopped':'Needs attention');}throw e;}
  finally{signal?.removeEventListener('abort',abort);}
 }
 const timer=setInterval(()=>{if(!document.hidden&&isVisible()&&!host.contains(document.activeElement))void refresh(false,true);},15000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {element:host,show(){readPins();host.hidden=false;void refresh();},hide(){host.hidden=true;},inspect,run,refresh,events,get selected(){return selected;},get snapshot(){return {sessions,usage,selected:selected?.sessionId};},showPending};
}
