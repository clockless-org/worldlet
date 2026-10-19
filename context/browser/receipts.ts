import type {WorldItem} from '../../contracts/world-item.ts';

import type {BrowserReceipt} from '../../contracts/browser-receipt.ts';

function instant(now:number){
 if(!Number.isFinite(now))throw Error('Invalid browser receipt clock.');
 return new Date(now*1000).toISOString();
}
function equal(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const left=Object.keys(a),right=Object.keys(b);
 return left.length===right.length&&left.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
}
// Attention synthesis may refresh how a task reads while Fox works on it (wording, its run and
// dependency bookkeeping). That is not a different obligation; status, kind, evidence and timing are.
const PRESENTATION=new Set(['title','summary','reason','context','attentionReason','event','runId','updatedAt','attentionContentVersion','attentionDependencies','attentionMode','attentionInvalidated']);
const obligation=(item:object)=>Object.fromEntries(Object.entries(item).filter(([key])=>!PRESENTATION.has(key)));
export function beginBrowserReceipt(input:{id:string;label:string;origin:string;attemptKey:string;taskID?:string;items:WorldItem[];receipts:BrowserReceipt[];now:number}):BrowserReceipt {
 const {id,label,origin,attemptKey,taskID,items,receipts,now}=input;
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||typeof label!=='string'||!/^https:\/\/[^\s/?#@]+$/.test(origin)||typeof attemptKey!=='string'||!attemptKey||attemptKey.length>1024)throw Error('Invalid browser receipt identity.');
 if(receipts.some(r=>r.attemptKey===attemptKey||r.id===id))throw Error('This control was already attempted. Check its browser receipt instead of submitting again.');
 // A multi-step flow (cancel, then confirm) may continue once the previous step's result was
 // inspected; an uninspected step blocks the task, and the same control never repeats (above).
 const pending=taskID?receipts.find(r=>r.taskID===taskID&&r.status==='unverified'&&!r.inspectedAt):undefined;
 if(pending)throw Error(`Check the previous step first: take a fresh snapshot or call outcome with receiptId ${pending.id}, then continue with the next control. Do not repeat a submission.`);
 const row:BrowserReceipt={id,operationId:id,attemptKey,label:Array.from(label).slice(0,180).join(''),origin,status:'unverified',createdAt:instant(now)};
 if(taskID!==undefined){
  const task=items.find(i=>i.id===taskID&&i.kind==='task');
  if(!task)throw Error('Choose a saved task before linking this browser action.');
  row.taskID=taskID;row.task=JSON.parse(JSON.stringify(task));row.taskTitle=task.title;
 }
 return row;
}
/** Host supplies only a normalized HTTPS origin, never page text or a URL query. */
export function observeBrowserReceipt(row:BrowserReceipt,origin:string,now:number):BrowserReceipt {
 if(row.status!=='unverified')return row;
 const next={...row};delete next.inspectedAt;
 if(origin===row.origin)next.inspectedAt=instant(now);
 return next;
}
/** User confirmation enters here only after the host enforces its UI authority. */
export function resolveBrowserReceipt(input:{receipt:BrowserReceipt;done:boolean;items:WorldItem[];now:number}){
 const {receipt,done,items,now}=input;
 if(typeof done!=='boolean'||receipt.status!=='unverified')throw Error('This browser result was already reviewed.');
 const reviewedAt=instant(now);let completeTaskID:string|undefined;
 if(done){
  const inspected=Date.parse(receipt.inspectedAt||'')/1000,age=now-inspected;
  if(!Number.isFinite(age)||age<0||age>=300)throw Error('Check the result page before confirming completion.');
  if(receipt.taskID){
   const current=items.find(i=>i.id===receipt.taskID);
   // Already settled (for example reviewed as resolved): the person's confirmation is recorded
   // without a second completion. Otherwise the task must be unchanged since the attempt.
   if(current?.status!=='done'){
    if(!receipt.task||!current||!equal(obligation(current),obligation(receipt.task)))throw Error('The linked task changed. Review it in Attention Center; it has not been marked done.');
    completeTaskID=receipt.taskID;
   }
  }
 }
 const row:BrowserReceipt={...receipt,status:done?'user_confirmed':'not_completed',reviewedAt};delete row.task;
 return {receipt:row,event:done?'verified' as const:'not_completed' as const,...completeTaskID?{completeTaskID}:{}};
}
