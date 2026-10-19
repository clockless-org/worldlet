import {APP_DEFINITIONS} from '../../context/applets/index.ts';
import {projectWorldItems,refreshItemPage} from '../../context/items/index.ts';
import {attentionFocusEvidence,attentionFocusSet,attentionOrder,attentionRankSignals,attentionRelevant,type AttentionFocusState} from './attention-focus.ts';
import {attentionLevel} from './attention-level.ts';
import {attentionReturnWhen} from './matter-time.ts';
import {collectMatters} from './matters.ts';
import {collectNativeActions,upcomingEvents} from './signals.ts';

/** The Center's groups in Now, in the order the desktop shows them. */
export const ATTENTION_GROUPS=[['event','Coming Up'],['needsAction','Worth Doing'],['unseen','Worth Knowing']] as const;

/** The Attention Center's Now and Later for a phone or a browser, worked out from the saved World items alone, with no
 * World page (platform/web/README.md#web). The rows are the ones the desktop builds for the same items (collectMatters
 * over the items' pages in their Applets, focus by attentionFocusSet, groups by attentionOrder). They differ where the
 * desktop knows more: its place on the map (region relevance) and the sample world. `saved` is the focus state of the
 * previous call, so the set stays steady between calls; the result returns the next one. */
export function hostAttention(items:any[],{now=Date.now(),saved=null,mode='auto'}:{now?:number,saved?:Partial<AttentionFocusState>|null,mode?:string}={}){
 const world:any={pages:[],roots:['root'],spaces:[]};
 projectWorldItems(world,Array.isArray(items)?items:[]);
 for(const page of world.pages)refreshItemPage(page,now);
 const pages=new Map<string,any>(world.pages.map((p:any)=>[p.id,p]));
 // Each item's page belongs to the Applet that published it, as the World's Applets own them.
 const apps=new Map<string,any>();
 for(const p of world.pages){
  const app=APP_DEFINITIONS.find(a=>a.key===p.sourceProvider||a.connection.provider===p.sourceProvider);
  if(!app)continue;
  if(!apps.has(app.id))apps.set(app.id,{id:'place-'+app.id,moduleId:app.id,entity:'app',key:app.key,title:app.title,children:[]});
  apps.get(app.id).children.push(p.id);
 }
 const sections=[...apps.values()];
 const rows=(view:Map<string,any>)=>collectMatters({sections,pages:view,activities:collectNativeActions({pages:view,sections}).activities,events:upcomingEvents({pages:view,sections,limit:Infinity}),current:null,currentSpace:null,depth:'overview',now}).filter((item:any)=>item.signalCount);
 const all=rows(pages);
 // Focus, as the desktop keeps it: a steady set the size of a screen; the rest waits in Later.
 const grouped=new Set(all.flatMap((m:any)=>m.worldItemIds||[]));
 const keyOf=(m:any)=>m.worldItemIds?.find((id:string)=>[...(saved?.ids||[]),...(saved?.held||[])].includes(id))||m.worldItemId||m.id;
 const snoozed=[...[...pages.values()].filter(p=>p.worldItemId&&!grouped.has(p.worldItemId)&&Date.parse(p.worldItemSnoozedUntil)>now).map(p=>p.worldItemId),...all.filter((m:any)=>m.worldItemIds&&Date.parse(m.snoozedUntil)>now).map(keyOf)];
 const start=(m:any)=>{const value=m.signals?.[0]?.start??m.start;const time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)?time:Infinity;};
 const focus=attentionFocusSet({items:all.map((m:any)=>({...attentionRankSignals(m),id:keyOf(m),level:attentionLevel(m),state:m.state,relevant:attentionRelevant(undefined,mode,new Date(now)),soon:start(m)-now<3*86400000,
  evidence:attentionFocusEvidence(m.sources||m.pageIds?.flatMap((id:string)=>pages.get(id)?.worldItemSources||[])||[])})),saved,snoozed,now});
 const members=new Set(focus.ids);
 const shown=all.filter((m:any)=>members.has(keyOf(m))),held=all.filter((m:any)=>!members.has(keyOf(m)));
 // Later also holds what the person put off: the rows those pages make when the snooze ends.
 const later=new Map<string,any>();
 for(const [id,p] of pages){const until=Date.parse(p.worldItemSnoozedUntil);if(!p.worldItemId||!(until>now))continue;const page={...p};refreshItemPage(page,until+1);if(page.activities.length)later.set(id,page);}
 const snoozedRows=later.size?rows(new Map([...pages].map(([id,p])=>[id,later.get(id)||{...p,activities:[],events:[]}]))).map((m:any)=>{const page=pages.get(m.pageId||m.pageIds?.[0]);return {...m,snoozed:true,when:attentionReturnWhen(m.snoozedUntil||page?.worldItemSnoozedUntil)||m.when};}):[];
 const level=(m:any)=>({...m,level:attentionLevel(m)});
 const nowRows=ATTENTION_GROUPS.flatMap(([state])=>attentionOrder(shown.filter((m:any)=>m.state===state),{mode,now:new Date(now),region:()=>undefined,importance:attentionLevel}));
 return {now:nowRows.map(level),later:[...held,...snoozedRows].map(level),saved:focus.saved};
}
