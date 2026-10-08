// Review the immutable native draft. Sending is only reachable from this button.
export function mountEmailReview(call,getView){
 window.addEventListener('worldlet:email-review',(event:any)=>presentEmailReview(call,getView,event.detail));
 window.addEventListener('worldlet:email-drafts',async()=>{
  try {
   const result=await call('emailAction',{operation:'list'}),body=document.createElement('section'),reviews=result.reviews||[],latest=reviews.find(review=>!review.attempted);
   const buttons=reviews.filter(review=>review!==latest).map(review=>{
    const button=document.createElement('button');button.type='button';button.textContent=(review.attempted?'Check delivery · ':'Draft · ')+(review.draft.subject||'(No subject)');
    button.onclick=()=>presentEmailReview(call,getView,{...review,attempted:!!review.attempted});return button;
   });
   // Reviews come newest first; opening the drafts keeps the newest pending draft reviewable instead of hiding it behind a list.
   if(latest)return presentEmailReview(call,getView,{...latest,attempted:false,others:buttons});
   body.append(...buttons);
   getView()?.setGuide({source:'email-review',text:result.reviews?.length?'Your saved email reviews. Sending always needs your confirmation.':'No saved email reviews.',body,actions:[],takeover:true});
  }catch(error){getView()?.setGuide({text:error.message||'Saved email reviews are unavailable.',actions:[],takeover:true});}
 });
}
export function presentEmailReview(call,getView,{id,draft,practice=false,attempted:restoredAttempt=false,others=[]}){
  let busy=false,finished=false;
  const body=document.createElement('section');body.className='fox-email-review';
  const address=document.createElement('p');address.textContent=`From: ${draft.from}\nTo: ${draft.to}\nSubject: ${draft.subject}`;address.style.whiteSpace='pre-wrap';
  const text=document.createElement('pre');text.textContent=draft.body;text.style.cssText='white-space:pre-wrap;font:inherit;max-height:32vh;overflow:auto';body.append(address,text);
  if(others.length){const label=document.createElement('p');label.textContent='Other saved reviews';body.append(label,...others);}
  const send=document.createElement('button'),cancel=document.createElement('button'),discard=document.createElement('button');discard.textContent='Discard saved review';discard.type='button';send.textContent='Send';cancel.textContent='Cancel';send.type=cancel.type='button';
  const show=(message=practice?'Review this practice email. No external message will be sent.':'Review this email before sending.')=>getView()?.setGuide({source:'email-review',text:message,body,actions:finished?[]:[send,cancel,...(attempted?[discard]:[])],takeover:true});
  let authorize=false,attempted=restoredAttempt;
  if(attempted){send.textContent='Check delivery';cancel.textContent='Close';}
  const delivered=()=>{finished=true;getView()?.setGuide({source:'email-review',text:practice?'Email recorded for '+draft.to+' in this practice world.':'Sent to '+draft.to+'.',actions:[],takeover:true});if(!practice)Promise.resolve().then(()=>call('emailAction',{operation:'acknowledge',id})).catch(()=>{});};
  const checkDelivery=async()=>{
   const receipt=await call('emailAction',{operation:'reconcile',id});
   if(receipt.status==='sent'){delivered();return;}
   show('Sending is not confirmed yet. Check delivery again shortly or inspect Sent mail. Do not send another copy.');
  };
  send.onclick=async()=>{
   if(busy||finished)return;busy=true;send.disabled=cancel.disabled=true;
   try{
    if(attempted){await checkDelivery();return;}
    if(authorize){await call('emailAction',{operation:'authorize',id});authorize=false;send.textContent='Send';show('Send access is ready. Review the draft, then press Send.');return;}
    attempted=!practice;
    const result=await call('emailAction',{operation:'send',id});
    if(result.needsAuthorization){attempted=false;authorize=true;send.textContent='Allow sending';show('Your Google connection is read-only. Allow sending, then return here to confirm this email.');return;}
    if(result.status!==(practice?'recorded':'sent'))throw Error('No delivery confirmation was received. Check Sent mail before trying again.');
    delivered();
   }catch(error){
    if(attempted){send.textContent='Check delivery';cancel.textContent='Close';
     try{await checkDelivery();}catch{show('Sending is not confirmed. Delivery could not be checked. Try Check delivery again; do not send another copy.');}
    }else show(error.message||'Could not send. Check Sent mail before creating another draft.');
   }
   finally{busy=false;send.disabled=cancel.disabled=false;}
  };
  cancel.onclick=async()=>{if(busy||finished)return;if(attempted){finished=true;getView()?.setGuide({text:'Review closed. Delivery is still unconfirmed; check Sent mail before sending another copy.',actions:[],takeover:true});return;}busy=true;send.disabled=cancel.disabled=true;try{await call('emailAction',{operation:'cancel',id});finished=true;getView()?.setGuide({text:'Draft cancelled. Nothing was sent.',actions:[],takeover:true});}catch(error){show(error.message||'Could not cancel this draft.');}finally{busy=false;send.disabled=cancel.disabled=false;}};
  let discardConfirmed=false;
  discard.onclick=async()=>{
   if(busy||finished)return;
   if(!discardConfirmed){discardConfirmed=true;discard.textContent='Confirm discard';show('Remove this saved review from this device? This does not recall an email or change its delivery.');return;}
   busy=true;discard.disabled=send.disabled=cancel.disabled=true;
   try{await call('emailAction',{operation:'discard',id});finished=true;getView()?.setGuide({text:'Saved review removed. Any email already sent is unchanged.',actions:[],takeover:true});}
   catch(error){show(error.message||'Could not remove the saved review.');}
   finally{busy=false;discard.disabled=send.disabled=cancel.disabled=false;}
  };
  show(attempted?'A previous send needs checking. Check delivery before preparing another copy.':undefined);
}
