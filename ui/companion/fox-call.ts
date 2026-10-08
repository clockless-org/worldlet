import {callBrief,callOpening,callStatus} from '../../core/ongoing/index.ts';

/** Calling from an Applet (core/agent/PORTABILITY.md#calling-from-an-applet), in Fox's card. An Applet's Call sends its
 * brief (`worldlet:call-request`: number, name, why, what to ask); the host checks the Agent can dial (`harnessCall`
 * `prepare`) and Fox shows whom it calls, why and what to find out to edit, what the Agent will say first, and Call and
 * Cancel. Only Call dials, through the person's own Agent. When their Agent cannot call, Fox says plainly how to get
 * one. A call in progress (placed here or not, `worldlet:harness-call`) then shows live: its status, the transcript as
 * it grows and Hang up; when it ends, how it went. */
export function mountHarnessCall(call,getView){
 const button=(label)=>{const b=document.createElement('button');b.type='button';b.textContent=label;return b;};
 const say=(text,source='harness-call')=>getView()?.setGuide({source,text,actions:[],takeover:true});
 let following='',clock:ReturnType<typeof setInterval>|null=null;
 window.addEventListener('worldlet:call-request',async(event:any)=>{
  const asked=event.detail||{};
  let reply;
  try{reply=await call('harnessCall',{operation:'prepare',to:asked.to,who:asked.who,behalf:asked.behalf,why:asked.why,ask:asked.ask,from:asked.from});}
  catch(error){say(error?.message||'Your Agent could not get the call ready.');return;}
  if(!reply?.ready){say(reply?.note||'Your Agent cannot place phone calls from the World.');return;}
  if(!reply.offer){say(reply.error||'That call is missing a number or a reason.');return;}
  const offer=reply.offer,name=offer.who||offer.to;
  const body=document.createElement('section');body.className='fox-call';
  const field=(label,value,rows)=>{
   const wrap=document.createElement('label');wrap.className='fox-call-field';wrap.textContent=label;
   const input=rows>1?Object.assign(document.createElement('textarea'),{rows}):document.createElement('input');input.value=value;input.maxLength=300;
   input.setAttribute('aria-label',label);input.style.cssText='display:block;width:100%;font:inherit';
   wrap.append(input);return {wrap,input};
  };
  const to=document.createElement('p');to.className='fox-call-to';to.textContent=(offer.who?offer.who+' · ':'')+offer.to+(offer.from?' · from '+offer.from:'');
  const why=field('Why',offer.why,1),ask=field('What to find out',offer.ask,2);
  const opening=document.createElement('p');opening.className='fox-call-opening';
  const note=document.createElement('small');note.textContent='Your Agent dials this number now and talks for you; it says it is an AI assistant. A call cannot be taken back.';
  const brief=()=>callBrief({...offer,why:why.input.value,ask:ask.input.value});
  const preview=()=>{const value=brief();opening.textContent='error' in value?value.error:'It opens with: “'+callOpening(value)+'”';dial.disabled=busy||'error' in value;};
  body.append(to,why.wrap,ask.wrap,opening,note);
  const dial=button('Call'),cancel=button('Cancel');
  let busy=false;
  const show=(text='Call '+name+'?')=>getView()?.setGuide({source:'harness-call',text,body,actions:[dial,cancel],takeover:true});
  why.input.addEventListener('input',preview);ask.input.addEventListener('input',preview);
  dial.onclick=async()=>{
   if(busy)return;busy=true;dial.disabled=cancel.disabled=true;
   try{const placed=await call('harnessCall',{operation:'place',id:offer.id,why:why.input.value,ask:ask.input.value});if(following!==placed.id){following=placed.id;say('Calling '+name+'…');}}
   catch(error){show(error?.message||'Your Agent could not place the call.');}
   finally{busy=false;cancel.disabled=false;preview();}
  };
  cancel.onclick=()=>{void call('harnessCall',{operation:'cancel',id:offer.id}).catch(()=>{});say('Not called.');};
  preview();show();
 });
 // A call in progress, as it changes: its status line, the transcript so far and Hang up; then how it went.
 window.addEventListener('worldlet:harness-call',(event:any)=>{
  const {call:live,who='',placed=false}=event.detail||{};
  if(!live||typeof live.id!=='string')return;
  const running=live.outcome==='in-progress';
  if(!running&&following!==live.id&&!placed)return;
  following=live.id;
  if(clock){clearInterval(clock);clock=null;}
  const name=who||live.peer;
  const body=document.createElement('section');body.className='fox-call-live';
  const list=document.createElement('ol');list.className='fox-call-transcript';list.setAttribute('aria-label','What is said on the call');list.style.cssText='max-height:32vh;overflow:auto;padding-left:0;list-style:none';
  for(const line of live.transcript||[]){const item=document.createElement('li');item.textContent=(line.speaker==='agent'?'Your Agent':name)+': '+line.text;list.append(item);}
  body.append(list);
  const hangUp=button('Hang up');
  hangUp.onclick=async()=>{hangUp.disabled=true;try{await call('harnessCall',{operation:'hangUp',id:live.id});}catch(error){getView()?.setGuide({source:'harness-call',text:error?.message||'Your Agent could not hang up.',body,actions:[hangUp],takeover:false});}finally{hangUp.disabled=false;}};
  const render=()=>getView()?.setGuide({source:'harness-call',text:callStatus(live,Date.now(),who),body:list.childElementCount===0&&running?null:body,actions:running?[hangUp]:[],takeover:false});
  render();
  list.lastElementChild?.scrollIntoView?.({block:'end'});
  if(running&&live.live==='talking'){clock=setInterval(()=>{if(following===live.id)render();else if(clock){clearInterval(clock);clock=null;}},1000);(clock as any).unref?.();}
  if(!running)following='';
 });
}
