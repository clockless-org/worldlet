// Only saved, actionable findings mark content inside an Applet. Raw records and
// connection counts are not evidence that the user needs to do something.
export function appletAttention(provider,pages){
 const candidates=pages.filter(p=>!(Date.parse(p.worldItemSnoozedUntil)>Date.now())&&p.worldItemId&&p.sourceProvider===provider&&(p.worldItemStatus==='open'||p.worldItemStatus==='read'&&p.worldItemKind!=='update'));
 const rank=p=>({urgent:20,high:10}[p.worldItemSignal?.priority]||0)+({task:3,event:2,update:1}[p.worldItemKind]||0);
 candidates.sort((a,b)=>rank(b)-rank(a)||String(a.worldItemId).localeCompare(String(b.worldItemId)));
 const item=candidates[0];if(!item)return null;
 return {id:item.worldItemId,itemIds:[...new Set(candidates.map(p=>p.worldItemId))].sort(),state:{task:'needsAction',event:'event',update:'unseen'}[item.worldItemKind]||'unseen',priority:item.worldItemSignal?.priority||'normal',label:item.title};
}

// World/Area guides only explain a disconnected account. Saved findings live in
// the Attention Center and their Applet; execution state belongs to the base lamp.
export function appletConnectionGuide(provider,status:any={}){
 return ['gmail','google-calendar'].includes(provider)&&status.phase==='disconnected'
  ?{badge:'connection',state:'needsAction',hint:'Connect your account'}:null;
}
