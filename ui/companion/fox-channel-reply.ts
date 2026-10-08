/** A reply Fox offers in a channel a brought conversation came from (`reply_in_channel`; core/agent/PORTABILITY.md
 * #replying-in-a-channel): a guide in Fox's card with where it goes, the exact text and Send, Edit and Skip. Only Send
 * sends, through the host (`channelReply`) and the person's own Agent; Edit turns the text into a field and Send then
 * sends what the field holds. A settled offer (sent or skipped, here or elsewhere) leaves a short line. */
export function mountChannelReply(call,getView){
 let open='';
 const line=(text)=>getView()?.setGuide({source:'channel-reply',text,actions:[],takeover:true});
 window.addEventListener('worldlet:channel-reply',(event:any)=>{
  const offer=event.detail||{};
  if(typeof offer.id!=='string'||!offer.id)return;
  const where=typeof offer.where==='string'&&offer.where?offer.where:'the conversation';
  if(offer.settled){if(open===offer.id){open='';line(offer.settled==='sent'?'Sent to '+where+'.':'Not sent.');}return;}
  if(typeof offer.text!=='string'||!offer.text)return;
  let editing=false,busy=false;
  const body=document.createElement('section');body.className='fox-channel-reply';
  const shown=document.createElement('pre');shown.textContent=offer.text;shown.style.cssText='white-space:pre-wrap;font:inherit;max-height:32vh;overflow:auto';
  const field=document.createElement('textarea');field.value=offer.text;field.rows=5;field.maxLength=4000;field.setAttribute('aria-label','Reply');field.style.cssText='width:100%;font:inherit';
  body.append(shown);
  const button=(label)=>{const b=document.createElement('button');b.type='button';b.textContent=label;return b;};
  const send=button('Send'),edit=button('Edit'),skip=button('Skip');
  const show=(text='Reply in '+where+'?')=>getView()?.setGuide({source:'channel-reply',text,body,actions:editing?[send,skip]:[send,edit,skip],takeover:true});
  const settle=async(operation,text?)=>{
   if(busy)return;busy=true;for(const b of [send,edit,skip])b.disabled=true;
   try{await call('channelReply',{operation,id:offer.id,...text===undefined?{}:{text}});if(open===offer.id){open='';line(operation==='send'?'Sent to '+where+'.':'Not sent.');}}
   catch(error){show(error?.message||'Your Agent could not send it.');}
   finally{busy=false;for(const b of [send,edit,skip])b.disabled=false;}
  };
  send.onclick=()=>settle('send',editing?field.value:offer.text);
  edit.onclick=()=>{editing=true;body.replaceChildren(field);show();field.focus();};
  skip.onclick=()=>settle('skip');
  open=offer.id;
  show();
 });
}
