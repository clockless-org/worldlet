/** Inspect only: this never repeats a potentially consequential click. */
export async function inspectBrowserOutcome(automate,receiptId:string,signal?:AbortSignal,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
 let last:any={error:'Result page is not ready.'};
 for(let attempt=0;attempt<4;attempt++){
  if(signal?.aborted)return {error:'Result check stopped. Submission may already have happened.',outcome:'unverified'};
  await wait(attempt===0?250:500);
  if(signal?.aborted)return {error:'Result check stopped. Submission may already have happened.',outcome:'unverified'};
  try{last=await automate({operation:'outcome',receiptId});}catch{last={error:'Result page could not be read.'};}
  if(last?.observation?.text)return last;
 }
 return {...last,outcome:'unverified',guidance:'Keep the task open. Check the result again; never repeat the submission just because inspection failed.'};
}
