/** The Feedback page: say it or type it, then Send. Holding the microphone button (or Fox) turns
 * speech into words in the box; nothing is sent until Send. */
export function createCompanionFeedback({call,onVoice=(_phase:string)=>{}}){
 const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
 const section=el('section');section.className='companion-info-section companion-feedback';section.dataset.section='Feedback';
 section.append(el('h3','Feedback'),el('p','Tell the Worldlet team what could be better. Hold the microphone to speak, or type.'));
 const text=el('textarea');text.setAttribute('aria-label','Your feedback');text.placeholder='What would make Worldlet better?';text.rows=6;text.maxLength=4000;
 const actions=el('div');actions.className='companion-feedback-actions';
 const mic=el('button','Hold to talk'),send=el('button','Send');mic.type=send.type='button';mic.className='companion-feedback-mic';send.className='companion-feedback-send';
 actions.append(mic,send);
 const status=el('p');status.setAttribute('role','status');status.className='companion-feedback-status';
 const disclosure=el('p','Only your message and the app version go to the Worldlet team.');disclosure.className='companion-info-note';
 section.append(text,actions,status,disclosure);
 let id=crypto.randomUUID(),sending=false,voice:'idle'|'starting'|'listening'|'processing'='idle',ticket=0,finishPending=false;
 function update(){
  const draft=text.value.trim();send.disabled=!draft||sending||voice!=='idle';text.disabled=sending||voice!=='idle';mic.disabled=sending||voice==='processing';
  send.textContent=sending?'Sending…':'Send';mic.textContent=voice==='listening'||voice==='starting'?'Release to stop':'Hold to talk';mic.setAttribute('aria-pressed',String(voice==='listening'||voice==='starting'));
  section.dataset.voice=voice;onVoice(voice);
 }
 text.addEventListener('input',()=>{id=crypto.randomUUID();status.textContent='';update();});
 async function finishVoice(){
  if(voice==='starting'){finishPending=true;return;}
  if(voice!=='listening')return;
  voice='processing';status.textContent='Preparing your words…';update();
  try{await call('speechStop');}catch(e){voice='idle';status.textContent=e.message||'Please try again.';update();}
 }
 async function startVoice(){
  if(sending||voice!=='idle')return;
  const turn=++ticket;finishPending=false;voice='starting';status.textContent='Starting microphone…';update();
  try{await call('speechStart',{hold:true,purpose:'feedback'});if(turn!==ticket)return;voice='listening';status.textContent='Listening…';update();if(finishPending)await finishVoice();}
  catch(e){if(turn!==ticket)return;voice='idle';status.textContent=e.message||'Microphone unavailable. You can type instead.';update();}
 }
 // Press and hold to talk; a click (keyboard or a quick tap) starts, and the next one stops.
 let held=false;
 mic.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=true;mic.setPointerCapture?.(e.pointerId);void startVoice();});
 mic.addEventListener('pointerup',()=>{if(!held)return;held=false;void finishVoice();});
 mic.addEventListener('pointercancel',()=>{if(held){held=false;void cancelVoice();}});
 mic.addEventListener('click',e=>{if((e as PointerEvent).detail!==0)return;if(voice==='idle')void startVoice();else void finishVoice();});
 window.addEventListener('worldlet:speech',(event:any)=>{
  if(voice==='idle')return;const value=event.detail;
  if(value.phase==='processing'){voice='processing';status.textContent='Preparing your words…';update();}
  if(value.phase==='final'){const words=[text.value.trim(),value.text?.trim()].filter(Boolean).join('\n');text.value=words.slice(0,4000);id=crypto.randomUUID();voice='idle';status.textContent=words.length>4000?'Your feedback reached 4,000 characters. Shorten it before sending.':'Hold again to add more, or Send.';update();}
  if(value.phase==='error'){voice='idle';status.textContent=value.text||'Please try again, or type instead.';update();}
 });
 async function cancelVoice(){ticket++;finishPending=false;if(voice!=='idle'){voice='idle';update();try{await call('speechCancel');}catch{}status.textContent='Stopped. Your words are kept.';}}
 send.onclick=async()=>{
  if(sending||voice!=='idle'||!text.value.trim())return;
  const submission={id,text:text.value.trim(),confirmed:true};sending=true;status.textContent='Sending to the Worldlet team…';update();
  try{const receipt=await call('feedback',submission);if(receipt?.ok!==true||receipt.id!==submission.id)throw Error('No receipt was returned. Please retry.');text.value='';id=crypto.randomUUID();status.textContent='Received by Worldlet. Thank you! Reference: '+receipt.id;}
  catch(e){status.textContent=(e.message||'Could not send feedback.')+' Your words are kept.';}
  finally{sending=false;update();}
 };
 window.addEventListener('blur',()=>void cancelVoice());update();
 return {element:section,startVoice,finishVoice,cancelVoice,get voicing(){return voice!=='idle';}};
}
