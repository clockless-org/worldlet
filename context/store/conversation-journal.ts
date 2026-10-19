/** Host-owned conversation evidence. Preserve submitted/received text before Harness/UI delivery. */
export function conversationEntries(input:{id:string;requestId:string;at:number;scope:string;type:string;text?:string}) {
 if(![input.id,input.requestId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(v))||!Number.isFinite(input.at)||!['private','setup','sample'].includes(input.scope)||!/^[a-z][a-z_]{0,40}$/.test(input.type)||input.text!==undefined&&typeof input.text!=='string')throw Error('Invalid conversation entry');
 const text=input.text??'',parts=Math.max(1,Math.ceil(text.length/16000));
 return Array.from({length:parts},(_,part)=>({version:1,id:input.id+'-'+part,at:input.at,kind:'conversation.'+input.type,requestId:input.requestId,runId:input.requestId,data:{scope:input.scope,part,parts,...(input.text===undefined?{}:{text:text.slice(part*16000,(part+1)*16000)})}}));
}
