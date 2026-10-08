/** A background re-read found changed evidence for a saved task (the ledger's `task-reviews`). The choice waits
 * on that task's Attention card, as one line with text-link choices, never over Fox's dialog (owner Order
 * 2026-10-07: decisions go to Attention). The host validates every choice; the model cannot approve. */
const SOURCES:Record<string,string>={gmail:'Mail','google-calendar':'Calendar',notion:'Notion',todoist:'Todoist'};
export type TaskReviewRow={id:string;provider:string;items:string[]};
export function taskReviewLine(reviews:TaskReviewRow[]|undefined,itemId:string,choose:(id:string,choice:string,candidateId:string)=>Promise<unknown>){
 const review=(reviews||[]).find(row=>row.items?.includes(itemId));
 if(!review)return null;
 const source=SOURCES[review.provider]||'A source';
 return {id:review.id,text:source+' has something new about this task.',choices:([['same','Update this task'],['new','Add as a new task'],['skip','Ignore']] as const)
  .map(([key,label])=>({key,label,run:()=>choose(review.id,key,itemId)}))};
}
