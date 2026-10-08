import {appletStatus as appStatus} from '../../core/applets/index.ts';

// Shared Full View inventory. Selecting a record displays its original.
export function createAppDevice({root,call,openRecord,onRecords}){
 const host=document.createElement('section');host.className='app-device-inventory';host.setAttribute('aria-label','Applet contents');host.hidden=true;root.append(host);
 const states=new Map();let app,connection;
 const el=(tag: string,cls: string,text?: string): any=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 const button=(title,run)=>{const b=el('button','app-device-row',title);b.type='button';b.onclick=run;return b;};
 const state=()=>{if(!states.has(app.provider))states.set(app.provider,{records:null,loading:false,error:'',loaded:false});return states.get(app.provider);};
 function draw(){
  if(!app)return;const s=state(),records=s.records??connection?.records??[],status=appStatus(app,[connection].filter(Boolean)),view=app.content||{},noun=view.noun||['result','results'];host.replaceChildren();
  const head=el('div','app-device-head');if(!view.hideTitle)head.append(el('h2','',app.title));
  const sync=button(s.loading?'Reading…':'Read now',()=>load(true));sync.disabled=s.loading;head.append(sync);host.append(head);
  const account=connection?.label&&connection.label!==app.title?connection.label:'';
  host.append(el('p','app-device-status',(s.loading?'Reading…':s.error?'Needs attention':view.statusText||status.label)+(account?' · '+account:'')));
  const scope=records.length===1?noun[0]:noun[1];host.append(el('p','ui-caption',`${records.length} ${scope} · Select an item to read`));
  if(s.scope)host.append(el('p','ui-caption',s.scope));
  if(s.error){const error=el('p','app-device-error',s.error);error.setAttribute('role','alert');host.append(error);}
  const list=el('div','app-device-records');
  for(const record of records){const b=button(record.title,()=>openRecord(app,record));b.dataset.recordId=record.id;list.append(b);}host.append(list);
  if(!records.length)host.append(el('p','ui-caption',s.loading?'Looking for your records…':!s.error&&s.records!==null&&view.empty?view.empty:'Ask Fox to find what you need, or read this app now.'));
  host.setAttribute('aria-busy',String(s.loading));
 }
 async function load(refresh=false){
  const selected=app,s=state();if(s.loading)return;s.loading=true;s.error='';s.loaded=true;draw();
  try{const result=await call({provider:selected.provider,refresh});s.records=result.pages||[];s.scope=result.scope||'';onRecords(selected,s.records);}
  catch(e){s.error=e.message||'Could not read. Try again.';}
  finally{s.loading=false;if(app?.provider===selected.provider)draw();}
 }
 return {show(value,link){app=value;connection=link;const s=state();if(link?.records)s.records=link.records;host.hidden=false;draw();void load(!!s.error);},hide(){host.hidden=true;},get element(){return host;}};
}
