import {attentionTimeline} from './time.ts';
const plain=value=>String(value||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/[*_`#]/g,'').replace(/\s+/g,' ').trim();
// A last resort for legacy rows only. Items are written to fit, and a row that
// fits is never cut: an ellipsis in the Attention Center hides the thing itself.
const short=(text,limit)=>text.length<=limit?text:text.slice(0,limit-1).trimEnd()+'…';
function excerpt(page){
 if(!page)return '';
 if(page.summary||page.description)return plain(page.summary||page.description);
 // Read an existing paragraph, without turning headings, mail headers or checklists
 // into invented instructions. No model call or new source fetch is needed.
 return (page.markdown||page.text||'').split(/\n\s*\n/).map(block=>block.split('\n').filter(line=>!/^\s*(?:#|[-*]\s|\d+\.\s|\||>|From:|To:|Subject:|Related:|Fictional\b)/i.test(line)&&plain(line)!==plain(page.title)).join(' ')).map(plain).find(Boolean)||'';
}
// When something happens, in the two forms a person actually uses: how far away it
// is, and the clock time it lands on. Both are derived here, never written by a model.
export function eventWhen(start,{end=null,allDay=false,now=new Date()}={}){
 const at=new Date(start);if(!Number.isFinite(at.getTime()))return null;
 const until=end==null?null:new Date(end);
 const validEnd=until&&Number.isFinite(until.getTime())&&until>at;
 const minutes=Math.ceil((at.getTime()-now.getTime())/60000);
 const midnight=new Date(now);midnight.setHours(0,0,0,0);
 const days=Math.round((new Date(at.getTime()).setHours(0,0,0,0)-midnight.getTime())/86400000);
 const time=date=>date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
 const dateTime=date=>date.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+time(date);
 const clock=allDay?'All day':validEnd?(at.toDateString()===until.toDateString()?time(at)+'–'+time(until):dateTime(at)+'–'+dateTime(until)):time(at);
 const relative=days===1?'Tomorrow':days>1?(days<7?at.toLocaleDateString('en-US',{weekday:'short'}):at.toLocaleDateString('en-US',{month:'short',day:'numeric'}))
  :allDay?'Today':minutes<=0?'Now':minutes<60?'in '+minutes+'m':'in '+Math.round(minutes/60)+'h';
 return {relative,clock,label:relative+', '+clock};
}
// Shelf timing is distinct from the card's date heading. Never infer an occurrence
// from createdAt/updatedAt: those are record timestamps, not user-facing facts.
export function attentionWhen(signal,context={}){
 return attentionTimeline(signal,context);
}
export function matterCopy(matter,signals,pages,now=Date.now()){
 const lead=signals[0],sourceId=lead?.pageId||lead?.pageIds?.[0],source=pages?.get(sourceId);
 let action;
 if(lead?.state==='needsAction')action=plain(lead.actionTitle||lead.objective||lead.label||lead.taskTitle)||plain(matter.title);
 else if(lead?.state==='event')action=plain(lead.taskTitle||lead.label||matter.title);
 else if(lead?.state==='unseen')action=plain(lead.actionTitle||source?.title||matter.title);
 else action=plain(matter.title);
 // The context says the thing itself. Which Applet it came from is already on the
 // Applet's own marker, and when it happens has its own place beside the title.
 if(source?.worldItemId)action=plain(source.title);
 const context=plain(source?.worldItemSignal?.reason)||plain(lead?.context)||excerpt(source)||plain(matter.description)||'';
 const when=lead?attentionWhen({...source?.worldItemSignal,...lead},{now:new Date(now)}):null;
 return {actionTitle:action,context:short(context,220),fullAction:action,fullContext:context,when};
}
