/** Full change review in the existing Fox surface. The model can prepare but cannot commit. */
export function mountHomeReview(call,getView){
 window.addEventListener('worldlet:home-review',(event:any)=>{
  const review=event.detail,plan=review.plan,body=document.createElement('section');body.className='fox-email-review';
  const heading=document.createElement('strong');heading.textContent=review.targetTitle;
  const destination=document.createElement('p');destination.textContent=review.destination;
  const details=document.createElement('dl');
  for(const key of ['operation','title','start','end','due','text'])if(plan[key]){const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=key[0].toUpperCase()+key.slice(1);value.textContent=plan[key];value.style.whiteSpace='pre-wrap';details.append(term,value);}
  body.append(heading,destination,details);
  for(const key of ['description','notice'])if(review[key]){const text=document.createElement('p');text.textContent=review[key];text.style.whiteSpace='pre-wrap';body.append(text);}body.style.cssText='max-height:45vh;overflow:auto';
  const confirm=document.createElement('button'),cancel=document.createElement('button');confirm.textContent='Confirm';cancel.textContent='Cancel';confirm.type=cancel.type='button';
  let attempted=false;
  const show=(text,actions)=>getView()?.setGuide({source:'home-review',text,body,actions,takeover:true});
  cancel.onclick=async()=>{if(attempted)return;attempted=true;await call('homeReview',{operation:'discard',id:review.id}).catch(()=>{});getView()?.setGuide(null,{only:'home-review',forget:true});};
  confirm.onclick=async()=>{if(attempted)return;attempted=true;confirm.disabled=cancel.disabled=true;
   try{const result=await call('homeReview',{operation:'commit',id:review.id});show(result.refreshPending?'Saved and checked in the source. Reopen the Applet to refresh its contents.':'Saved and checked in the source.',[]);window.dispatchEvent(new CustomEvent('worldlet:home-changed',{detail:{provider:plan.provider}}));}
   catch(error){show((error.message||'The result could not be verified.')+' Check the source before trying again.',[]);}
  };
  show('Review this change. Nothing has been written yet.',[confirm,cancel]);
 });
}
