export function mountNotionReview(call,getView){
 const present=(review)=>{
  const body=document.createElement('section');body.className='fox-email-review';
  const destination=document.createElement('p');destination.textContent=(review.operation==='create'?'New page under: ':'Append to: ')+review.targetTitle;
  const title=document.createElement('strong');title.textContent=review.title||'';
  const draft=document.createElement('pre');draft.textContent=review.markdown;draft.style.cssText='white-space:pre-wrap;font:inherit;max-height:34vh;overflow:auto';
  body.append(destination,title,draft);
  const submit=document.createElement('button'),close=document.createElement('button'),open=document.createElement('a');submit.type=close.type='button';close.textContent='Close';open.textContent='Open Notion';open.href=review.url;open.target='_blank';open.rel='noopener';
  let busy=false,status=review.status;
  const show=(text?)=>{submit.textContent=status==='review'?'Confirm write':'Check result';submit.disabled=status==='verified'||status==='failed';getView()?.setGuide({source:'notion-review',text:text||(status==='review'?'Review this Notion draft. Nothing has been written.':status==='verified'?'The content is visible in Notion.':'This write needs checking. Do not submit another copy.'),body,actions:[submit,open,close],takeover:true});};
  submit.onclick=async()=>{if(busy||status==='verified'||status==='failed')return;busy=true;submit.disabled=true;
   const operation=status==='review'?'commit':'check';if(operation==='commit')status='unconfirmed';
   try{const result=await call('notionReview',{operation,id:review.id});status=result.status;open.href=result.url;show(status==='failed'?'Notion reported that the write failed. Open the page to review it.':undefined);}
   catch(error){show(error.message||'The result is unconfirmed. Check Notion before preparing another copy.');}
   finally{busy=false;submit.disabled=status==='verified'||status==='failed';}
  };
  close.onclick=()=>{if(!busy)getView()?.setGuide(null,{only:'notion-review',forget:true});};
  show();
 };
 window.addEventListener('worldlet:notion-review',(event:any)=>present(event.detail));
 window.addEventListener('worldlet:notion-reviews',async()=>{
  try{const result=await call('notionReview',{operation:'reviews'}),body=document.createElement('section');
   for(const review of result.reviews||[]){const row=document.createElement('div'),button=document.createElement('button'),remove=document.createElement('button');button.textContent=(review.title||review.targetTitle)+' · '+review.status;button.onclick=()=>present(review);remove.textContent='Discard review';let confirmed=false;remove.onclick=async()=>{if(!confirmed){confirmed=true;remove.textContent='Confirm discard';return;}await call('notionReview',{operation:'discard',id:review.id});row.remove();};row.append(button,remove);body.append(row);}
   getView()?.setGuide({source:'notion-review',text:'Saved Notion reviews. Discard only removes the local draft; it does not undo a write.',body,actions:[],takeover:true});
  }catch(error){getView()?.setGuide({text:error.message||'Notion reviews are unavailable.',actions:[],takeover:true});}
 });
}
