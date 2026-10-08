/** The person's own Agent asks before it acts (contracts/harness-services.ts `approvals`, e.g. a Hermes Agent command it
 * considers dangerous): a guide in Fox's card with Allow once, Always and Deny. The answer goes back through the host
 * (`harnessApproval`) to the Harness; the turn waits for it. A settled request (answered here, on the phone, or expired)
 * leaves a short line, and when the allowed command or edit finishes the same card shows what it changed
 * (`approval_result`): each file's diff as the Harness reported it, or its output and that it reports no files. */
const LABELS={once:'Allow once',always:'Always',deny:'Deny'};
const SETTLED={once:'Allowed once.',always:'Allowed. It will not ask again for this; Settings › Approvals lists it.',deny:'Denied.'};
const CHANGE={add:'New file',edit:'Changed',delete:'Deleted'};
/** What the Harness reported, as the card's body: one diff per file, `+` and `-` lines marked; else its output. */
export function approvalResultBody(result){
 const box=document.createElement('div');box.className='fox-approval-result';
 const files=Array.isArray(result?.files)?result.files:[];
 for(const file of files.slice(0,20)){
  const head=document.createElement('strong');head.className='fox-approval-file';head.textContent=`${CHANGE[file.change]||'Changed'}: ${file.path}`;
  const diff=document.createElement('pre');diff.className='fox-approval-diff';
  for(const line of String(file.diff||'').split('\n')){
   const row=document.createElement('span');row.textContent=line+'\n';
   row.className=line.startsWith('+')?'fox-approval-add':line.startsWith('-')?'fox-approval-del':'fox-approval-same';
   diff.append(row);
  }
  box.append(head,diff);
 }
 if(!files.length&&typeof result?.output==='string'&&result.output.trim()){const output=document.createElement('pre');output.className='fox-approval-diff';output.textContent=result.output;box.append(output);}
 return box;
}
export function approvalResultText(result){
 const files=Array.isArray(result?.files)?result.files.length:0;
 if(result?.status==='failed')return files?`It did not finish. It had changed ${files} ${files===1?'file':'files'}:`:'It did not finish.';
 if(files)return `Done. It changed ${files} ${files===1?'file':'files'}:`;
 return result?.reported===false?'Done. Your Agent reports what the command printed, not which files it changed.':'Done. It reported no file changes.';
}
export function mountHarnessApproval(call,getView){
 let open='';
 // Requests this card showed, so a result that comes after the answer lands on the same card.
 const shown:string[]=[];
 window.addEventListener('worldlet:harness-approval',(event:any)=>{
  const request=event.detail||{};
  if(typeof request.id!=='string'||!request.id)return;
  if(request.result){
   if(shown.includes(request.id))getView()?.setGuide({source:'harness-approval',text:approvalResultText(request.result),body:approvalResultBody(request.result),actions:[],takeover:true});
   return;
  }
  if(request.settled){if(open===request.id){open='';getView()?.setGuide({source:'harness-approval',text:SETTLED[request.settled]||'Answered.',actions:[],takeover:true});}return;}
  const actions:HTMLButtonElement[]=[];
  const detail=typeof request.detail==='string'&&request.detail.trim()?document.createElement('code'):null;
  if(detail)detail.textContent=request.detail;
  for(const choice of (Array.isArray(request.choices)?request.choices:['deny']).filter(c=>c in LABELS)){
   const button=document.createElement('button');button.type='button';button.textContent=LABELS[choice];actions.push(button);
   button.onclick=async()=>{
    for(const b of actions)b.disabled=true;
    try{await call('harnessApproval',{id:request.id,choice});}
    catch(error){open='';getView()?.setGuide({source:'harness-approval',text:error?.message||'This request can no longer be answered.',actions:[],takeover:true});}
   };
  }
  open=request.id;shown.push(request.id);if(shown.length>20)shown.shift();
  getView()?.setGuide({source:'harness-approval',text:String(request.title||'Your Agent asks for permission'),...detail?{body:detail}:{},actions,takeover:true});
 });
}
