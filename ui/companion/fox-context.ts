// Keep the current UI anchor, not a copy of the user's world or page contents.
// Actual data is read through inspect_world/find_content/read_content/browser tools.
// This is the only place that bounds the context; callers pass raw values and the
// Hermes side (world_context.py) validates against the same shape. The app appends
// one more field on the way out, `history` from its ledger, bounded on its side.
import {WORLD_FACTS} from '../shell/index.ts';
import {FOX_MAIN_THREAD} from '../../contracts/companion-conversation.ts';

export function foxContext(context: any={}){
 const text=(value,size)=>typeof value==='string'?value.slice(0,size):'';
 const view=context.view;
 const actions=(Array.isArray(context.recentActions)?context.recentActions:[]).slice(-4)
  .map(a=>({id:text(a?.id,80),label:text(a?.label,120),location:text(a?.location,120),result:text(a?.result,160)})).filter(a=>a.id||a.label);
 return {thread:FOX_MAIN_THREAD,location:text(context.location,160),state:text(context.state,240),setup:text(context.setup,500),
  // The world's present, declared once in world-now.mjs. Small enough to carry
  // every turn, and constantly what a question turns on.
  ...Object.fromEntries(WORLD_FACTS.map(k=>[k,text(context[k],96)]).filter(([,v])=>v)),
  ...(view?{view:{id:text(view.id,160),title:text(view.title,160)}}:{}),
  ...(actions.length?{recentActions:actions}:{})};
}
