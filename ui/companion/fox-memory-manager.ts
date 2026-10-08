export function mountMemoryManager(call,getView){
 window.addEventListener('worldlet:memory-manager',async()=>{
  const view=getView();let state,kind='user',busy=false,confirming=false;
  const body=document.createElement('section');body.className='fox-email-review';
  const select=document.createElement('select');select.setAttribute('aria-label','Memory section');
  for(const [key,label] of [['user','About you'],['longTerm','Long-term memory']]){const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option);}
  const text=document.createElement('textarea');text.setAttribute('aria-label','Saved memory');text.style.cssText='width:100%;min-height:22vh;max-height:40vh;box-sizing:border-box;font:inherit';
  const note=document.createElement('p');note.textContent='Edits pin this section: Fox will not replace it automatically. Clearing saved memory does not erase conversations, sources or exported backups.';
  body.append(select,text,note);
  const save=document.createElement('button'),clear=document.createElement('button'),cancel=document.createElement('button');[save,clear,cancel].forEach(b=>b.type='button');save.textContent='Save changes';clear.textContent='Clear section';cancel.textContent='Close';
  const show=(message='Your saved memory. Edit the text, then save.')=>view?.setGuide({source:'memory-manager',text:message,body,actions:[save,clear,cancel],takeover:true});
  const render=()=>{text.value=state.sections.find(s=>s.kind===kind)?.text||'';text.disabled=save.disabled=clear.disabled=!state.editable;select.disabled=false;confirming=false;save.textContent='Save changes';show(state.editable?undefined:'This memory belongs to an attached Agent. Manage it in that Agent.');};
  select.onchange=()=>{if(busy)return;kind=select.value;render();};
  text.oninput=()=>{confirming=false;save.textContent='Save changes';};
  clear.onclick=()=>{text.value='';confirming=false;show('Save an empty section to clear this saved memory. Conversation history remains.');};
  save.onclick=async()=>{
   if(busy||!state?.editable)return;
   if(!confirming){confirming=true;save.textContent='Confirm save';show('Replace this saved memory section and start a fresh Fox context? Past conversations and sources remain.');return;}
   busy=true;save.disabled=clear.disabled=select.disabled=true;
   try{state=await call('companionMemory',{operation:'save',kind,text:text.value,revision:state.revision});render();show('Saved. Fox will use the corrected section in its next conversation.');}
   catch(error){show(error.message||'Memory was not saved. Reopen this view to reload.');}
   finally{busy=false;save.disabled=clear.disabled=!state?.editable;select.disabled=false;confirming=false;save.textContent='Save changes';}
  };
  cancel.onclick=()=>{if(!busy)view?.setGuide(null,{only:'memory-manager',forget:true});};
  try{state=await call('companionMemory',{operation:'list'});render();}catch(error){view?.setGuide({text:error.message||'Memory management is unavailable on this host.',actions:[],takeover:true});}
 });
}
