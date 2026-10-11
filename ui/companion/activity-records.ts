import {uiIcon} from '../components/index.ts';
import {companionStill,themeAppletIcon} from '../themes/index.ts';
import {WORLD_APPS} from '../../core/applets/index.ts';
import {journalPayload} from '../../core/items/index.ts';
/** Every event Worldlet recorded on this computer, newest first, for the Worldlet team (Settings › Help, folded under
 * For the Worldlet team). There is no History page any more (owner request 2026-10-10). Polling runs only while the
 * panel is open and the records show. */
export function createActivityRecords({call}:{call:any}){
 const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
 const records=el('section'),status=el('p','Loading records…'),list=el('ol'),controls=el('div');
 records.className='companion-history companion-history-records';records.setAttribute('aria-label','Activity records');
 status.setAttribute('role','status');list.setAttribute('aria-label','Activity records');
 const latest=el('button','Latest'),older=el('button','Older'),retry=el('button','Retry');
 for(const b of [latest,older,retry])b.type='button';controls.className='companion-history-controls';controls.append(latest,older,retry);records.append(status,controls,list);
 let active=false,version=0,timer:any=null,loading=false,rows:any[]=[],atLatest=true,head=0,hasMore=false,nextBefore:number|undefined;
 const labels={gmail:'Mail','google-calendar':'Calendar','apple-notes':'Notes','apple-reminders':'Reminders'};
 const rendered=new WeakMap<HTMLElement,string>();
 const operations={_source_result:'Read source records',upsert_world_items:'Save findings',review_world_item:'Review an item',update_world_item:'Update an item',archive_world_items:'Archive items',configure_world_check:'Configure a check',meeting_decisions:'Review meeting decisions'};
 function draw(animate=false){
  const existing=new Map<string,HTMLElement>(Array.from(list.children,(item:HTMLElement)=>[item.dataset.seq,item])),positions=new Map(Array.from(existing,([id,item])=>[id,item.getBoundingClientRect().top]));
  const keep=new Set(rows.map(row=>String(row.seq)));for(const [id,item] of existing)if(!keep.has(id))item.remove();
  let arrival=0;
  for(const row of rows){
   const previous=existing.get(String(row.seq));if(previous&&rendered.get(previous)===JSON.stringify(row)){list.append(previous);continue;}previous?.remove();
   const item=el('li'),time=el('time'),title=el('strong'),detail=el('p'),envelope=row.body||{},b=envelope.version===1?{...envelope.data,actor:envelope.actor}:envelope;
   const dateOf=value=>new Date(typeof value==='number'?value*1000:typeof value==='string'?value:NaN),date=dateOf(row.at),observed=dateOf(row.observedAt??envelope.observedAt);
   const legacy=row.legacy===true||!(row.id||envelope.id)||!Number.isFinite(observed.getTime());
   const gap=row.gap||row.kind==='activity.capture.gap'||row.kind==='activity.capture.error'||row.kind==='run.interrupted'||row.kind==='task.interrupted'&&b.errorCode==='process_interrupted';
   item.dataset.seq=String(row.seq);rendered.set(item,JSON.stringify(row));
   if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});time.title='Event time · '+date.toISOString();}else time.textContent='Event time unknown';
   const source=b.appletId||b.provider||b.moduleId||row.key,app=WORLD_APPS.find(app=>app.key===source||app.id===source),owner=labels[source]||app?.title||source||'World';
   const icon=el('span');icon.className='companion-history-source';icon.setAttribute('role','img');
   const actor=row.kind==='conversation.message'||!source?b.actor:null,assets=(globalThis as any).__WORLDLET_25D_ASSETS__,art=app&&(assets?.studies?.find(s=>s.key===app.key)?.body||themeAppletIcon(app.key));
   icon.setAttribute('aria-label',actor==='user'?'You':actor==='fox'?'Fox':owner);
   if(actor==='fox'||(!actor&&art)){const img=el('img');img.alt='';img.src=actor==='fox'?companionStill():art;icon.append(img);}
   else icon.innerHTML=uiIcon(actor==='user'?'people':({gmail:'mail','google-calendar':'calendar','apple-notes':'file','apple-reminders':'file',weather:'breeze',browser:'compass'})[app?.key||source]||'spark');
   if(gap){title.textContent=owner+' · Capture gap';detail.textContent='Some activity may be missing. Outcome unknown.';}
   else if(String(row.kind).startsWith('activity.')){title.textContent=owner+' · '+String(row.kind).slice(9).replaceAll('.',' ');detail.textContent='Observed on this device · Does not establish reading or external success.';}
   else if(/^(run|tool|model)\./.test(row.kind)){title.textContent=owner+' · '+String(row.kind).split('.')[0];detail.textContent=({started:'Started · Outcome unknown',requested:'Requested · Outcome unknown',succeeded:'Run completed · External outcome not verified',result:'Result recorded · External outcome not verified',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted · Outcome unknown'})[String(row.kind).split('.')[1]]||'Outcome unknown';}
   else if(row.kind==='world.action'){title.textContent=owner+' · '+String(b.action||'Action').replace(/([a-z])([A-Z])/g,'$1 $2');detail.textContent=({requested:'Requested · Outcome unknown',succeeded:'Action completed · External outcome not verified',failed:'Failed'})[b.phase]||'Outcome unknown';}
   else if(String(row.kind).startsWith('task.')){title.textContent=(b.ownerId||owner)+' · '+(b.pool||'Task');detail.textContent=({queued:'Queued · Outcome unknown',running:'Running · Outcome unknown',waiting:'Waiting · Outcome unknown',paused:'Paused · Outcome unknown',succeeded:'Task completed · External outcome not verified',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted · Outcome unknown'})[b.status]||'Outcome unknown';}
   else if(row.kind==='conversation.message'){title.textContent=b.actor==='user'?'You said':b.actor==='fox'?'Fox replied':'Conversation';detail.textContent=b.preview||'Conversation saved.';}
   else if(row.kind==='applet.check'){title.textContent=owner+' · Background check';detail.textContent=({started:'Started · Outcome unknown',complete:'Check completed',error:'Failed',cancelled:'Cancelled'})[b.status]||'Outcome unknown';}
   else if(row.kind==='applet.activity'){title.textContent=owner+' · '+(operations[b.operation]||'Activity');detail.textContent=(({complete:'Activity completed · External outcome not verified',cancelled:'Cancelled',error:'Failed',failed:'Failed'})[b.status]||'Outcome unknown')+(typeof b.count==='number'?' · '+b.count+' records':'');}
   else {title.textContent=owner+' · Recorded event';detail.textContent=String(row.kind).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[._]/g,' ')+(b.operation?' · '+b.operation:'')+' · Outcome unknown';}
   const content=el('div'),provenance=el('p','Source: '+owner);
   if(Number.isFinite(observed.getTime())){const saved=el('time',' · Saved '+observed.toLocaleString());saved.dateTime=observed.toISOString();saved.title='Local save time · '+observed.toISOString();provenance.append(saved);}
   content.append(time,title,detail,provenance);
   if(legacy)content.append(el('p','Legacy record · Identity or save-time metadata unavailable.'));
   if(b.truncated===true||b.omitted||row.content)content.append(el('p','Partial record · Some content is not shown.'));item.append(icon,content);list.append(item);
   if(animate&&records.isConnected&&!matchMedia('(prefers-reduced-motion: reduce)').matches)item.animate([{opacity:0,transform:'translateY(-12px)'},{opacity:1,transform:'none'}],{duration:280,delay:Math.min(arrival++,4)*70,easing:'ease-out',fill:'backwards'});
  }
  if(animate&&records.isConnected&&!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const [id,item] of existing)if(keep.has(id)){const delta=positions.get(id)-item.getBoundingClientRect().top;if(delta)item.animate([{transform:`translateY(${delta}px)`},{transform:'none'}],{duration:280,easing:'ease-out'});}
  older.disabled=!hasMore;latest.disabled=atLatest;retry.hidden=true;
 }
 async function refresh(mode:'poll'|'latest'|'older'='poll'){
  if(!active||loading)return;loading=true;const turn=version;
  try{
   const result=await call('worldHistory',mode==='older'?{before:nextBefore}:{});
   if(!active||turn!==version)return;
   const entries=result?.entries;
   if(!Array.isArray(entries))throw Error('History unavailable');
   // Hosts own scope/filtering; apply the existing payload redaction before rendering either shape.
   const next=entries.map(row=>{
    // `key` here is the source identifier, not a credential-bearing payload key.
    const clean=journalPayload({...row,sourceKey:row.key}) as any;return {...clean,key:clean.sourceKey};
   }),newHead=next[0]?.seq||0;
   const main=records,reading=showingRecords()&&main.scrollTop>60;
   if(mode==='poll'&&!result.sample&&rows.length&&(!atLatest||reading)){
    if(newHead>head){latest.disabled=false;latest.textContent='New activity · Latest';status.textContent='New activity is available.';}return;
   }
   hasMore=typeof result.hasMore==='boolean'?result.hasMore:next.length===50;nextBefore=result.nextBefore??next.at(-1)?.seq;
   if(mode==='older')atLatest=false;else {atLatest=true;head=newHead;latest.textContent='Latest';}
   if(mode!=='poll'||JSON.stringify(rows)!==JSON.stringify(next)){const animate=mode==='poll'&&rows.length>0;rows=next;draw(animate);if(animate&&main)main.scrollTop=0;}
   older.disabled=!hasMore;
   status.textContent=result.sample?'History is available in your personal world.':rows.length?'Saved on this device · May be incomplete · Updates every 2 seconds':atLatest?'No activity recorded yet.':'No older activity recorded.';
   retry.hidden=true;
  }catch{if(active&&turn===version){status.textContent='Could not refresh history. Your saved history is kept.';retry.hidden=false;}}
  finally{if(turn===version)loading=false;}
 }
 const showingRecords=()=>records.isConnected&&!records.closest('[hidden],details:not([open])');
 async function navigate(mode:'latest'|'older'){await refresh(mode);records.scrollTop=0;}
 latest.onclick=()=>void navigate('latest');older.onclick=()=>void navigate('older');retry.onclick=()=>void refresh('latest');
 function start(){if(active)return;active=true;version++;loading=false;timer=setInterval(()=>{if(document.hidden)return;if(showingRecords())void refresh();},2000);}
 function stop(){active=false;version++;loading=false;clearInterval(timer);}
 draw();
 return {records,start,stop,
  /** Settings › Help shows the records: read the latest page now. */
  showRecords(){if(active)void refresh('latest');}};
}
