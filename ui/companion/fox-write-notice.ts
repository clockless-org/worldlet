/** Notices for direct guarded writes (#407). Direct requests run without confirmation
 * and offer Undo; writes after untrusted content show the host's honest denial. */
export function mountWriteNotice(call,getView){
 window.addEventListener('worldlet:write-notice',(event:any)=>{
  const notice=event.detail||{};const actions:HTMLButtonElement[]=[];
  if(notice.undoable){
   const button=document.createElement('button');button.type='button';button.textContent='Undo';actions.push(button);
   button.onclick=async()=>{
    button.disabled=true;
    try{await call('worldWriteUndo',{id:notice.id});getView()?.setGuide({source:'write-notice',text:'Undone.',actions:[],takeover:true});}
    catch(error){button.disabled=false;getView()?.setGuide({source:'write-notice',text:error.message||'Could not undo this change.',actions,takeover:true});}
   };
  }
  getView()?.setGuide({source:'write-notice',text:String(notice.text||''),actions,takeover:true});
 });
}
