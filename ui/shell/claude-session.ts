export function createClaudeSession(call,setGuide,selection){
 return {async run(text,{signal,onDelta}){
  const selected=selection();if(!selected?.item.session)throw Error('Choose a Claude Code session first.');
  const id=selected.item.session.sessionId;let pending=null,closed=false;
  const deny=()=>{pending?.({allow:false});pending=null;setGuide(null,{only:'claude-permission'});};
  const abort=()=>{deny();void call({operation:'cancel'}).catch(()=>{});};
  signal?.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});
  window.worldletClaudeCancel=deny;
  window.worldletClaudeEvent=async event=>{
   if(closed||signal?.aborted)return {id:event.id,allow:false};
   if(event.type==='delta'){onDelta?.(event.text);return {};}
   if(event.type!=='permission')return {};
   return new Promise(resolve=>{
    pending=value=>resolve({id:event.id,...value});
    const detail=document.createElement('pre');detail.textContent=JSON.stringify(event.input,null,2);detail.style.cssText='white-space:pre-wrap;font:inherit;max-height:30vh;overflow:auto';
    const button=(label,allow)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{pending?.({allow});pending=null;setGuide(null,{only:'claude-permission'});};return b;};
    setGuide({source:'claude-permission',text:'Claude Code requests '+event.tool+' in '+(selected.item.session.cwd||'this project')+'.',body:detail,actions:[button('Allow once',true),button('Deny',false)],takeover:true});
   });
  };
  try{const result=await call({operation:'send',id,text});signal?.throwIfAborted();if(selection()===selected)await selected.refresh?.();return {message:result.message||'Claude Code finished this turn.'};}
  finally{closed=true;deny();signal?.removeEventListener('abort',abort);delete window.worldletClaudeEvent;delete window.worldletClaudeCancel;}
 }};
}
