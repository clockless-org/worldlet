/** Durable command receipts. Unknown external effects must never be auto-replayed. */
export interface RuntimeOperation {
 id:string;ownerId:string;command:string;scope:string;reference:string;
 status:'prepared'|'submitted'|'succeeded'|'unknown'|'cancelled'|'not_completed';
 createdAt:number;updatedAt:number;
}
export function prepareOperation(input:{id:string;ownerId:string;command:string;scope:string;reference:string;now:number;existing?:RuntimeOperation}):RuntimeOperation {
 const {id,ownerId,command,scope,reference,now,existing}=input;
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!/^[-a-z0-9]{1,80}$/.test(ownerId)||!/^[-a-z0-9.]{1,100}$/.test(command)||!scope||scope.length>128||reference!==id||!Number.isFinite(now))throw Error('Invalid operation identity');
 if(existing){
  if(existing.id!==id||existing.ownerId!==ownerId||existing.command!==command||existing.scope!==scope||existing.reference!==reference)throw Error('Operation identity changed');
  return existing;
 }
 return {id,ownerId,command,scope,reference,status:'prepared',createdAt:now,updatedAt:now};
}
export function transitionOperation(operation:RuntimeOperation,event:'submit'|'uncertain'|'verified'|'cancel'|'not_completed',now:number):RuntimeOperation {
 if(!Number.isFinite(now))throw Error('Invalid operation clock');
 let status=operation.status;
 if(event==='submit'){
  if(status!=='prepared')throw Error('Operation already attempted; reconcile its outcome before any new action');
  status='submitted';
 }else if(event==='uncertain'){
  if(status==='submitted')status='unknown';
 }else if(event==='verified'){
  if(!['submitted','unknown','succeeded'].includes(status))throw Error('Only an attempted operation can be completed');
  status='succeeded'; // Only a trusted verified provider receipt can invoke this event.
 }else if(event==='not_completed'){
  if(!['submitted','unknown','not_completed'].includes(status))throw Error('Only an attempted operation can be marked not completed');
  status='not_completed';
 }else if(event==='cancel'){
  if(status!=='prepared'&&status!=='cancelled')throw Error('A submitted operation cannot be cancelled locally');
  status='cancelled';
 }else throw Error('Unknown operation event');
 return {...operation,status,updatedAt:now};
}
/** Companion-safe receipt projection; no payload, account binding or raw errors. */
export function operationReport(rows:RuntimeOperation[],owner?:string){
 return rows.filter(r=>!owner||r.ownerId===owner).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,40).map(r=>({id:r.id,ownerId:r.ownerId,command:r.command,status:r.status,updatedAt:r.updatedAt,canResubmit:false,needsReconciliation:r.status==='unknown'||r.status==='submitted'}));
}

/** Transport success is not proof that a Notion page contains the requested change. */
export function notionOperationOutcome(status:string):'verified'|'uncertain'|null {
 if(status==='verified')return 'verified';
 if(status==='review')return null;
 return 'uncertain'; // Pending, submitted, failed or unrecognized receipts require checking.
}

/** A recoverable Attention → Browser handoff, projected from existing durable receipts.
 * No new executor, and no automatic replay or assertion of an external outcome. */
export function browserWorkflowReport(receipts:any[],items:any[],owner?:string){
 const safe=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,200}$/.test(value)?value:null;
 return receipts.filter(row=>safe(row.id)&&safe(row.taskID)&&['unverified','user_confirmed','not_completed'].includes(row.status)).map(row=>{
  const task=items.find(item=>item.id===row.taskID),provider=safe(task?.provider??row.task?.provider);
  if(!provider||(owner&&provider!==owner))return null;
  const state=row.status==='user_confirmed'?'completed':row.status==='not_completed'?'not_completed':!task?'source_unavailable':'needs_review';
  return {id:row.id,taskId:row.taskID,sourceApplet:provider,operationId:safe(row.operationId)??row.id,state,
   steps:[{key:'browser_submission',status:'attempted'},{key:'outcome_review',status:state==='needs_review'?'pending':state}],
   nextAction:state==='needs_review'?{target:'browser',action:'outcome',args:{receiptId:row.id}}:null,
   canReplay:false};
 }).filter(Boolean).slice(-40).reverse();
}
