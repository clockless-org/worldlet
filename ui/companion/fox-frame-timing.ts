import {FOX_STATES} from './fox-state-catalog.ts';
import {foxAnimationPhase} from './fox-animation-phase.ts';
const knownRoutes=new Set(FOX_STATES.map(state=>'anatomy-v1:'+state.id));
/** Local Dev diagnostics only. Bounded numeric timings, never user content or
 * network telemetry. RAF delivery and synchronous draw cost are distinct:
 * draw cost does not include asynchronous GPU/compositor presentation. */
export function createFoxFrameTiming(capacity=600){
 if(!Number.isInteger(capacity)||capacity<2||capacity>3600)throw Error('Invalid timing capacity');
 const rows:{at:number;draw:number;interval?:number;route:string;phase:ReturnType<typeof foxAnimationPhase>}[]=[];
 let cursor=0,lastRAF:number|undefined;
 const stats=(values:number[])=>{
  if(!values.length)return null;
  values.sort((a,b)=>a-b);
  return {count:values.length,median:values[Math.floor((values.length-1)*.5)],p95:values[Math.floor((values.length-1)*.95)],max:values[values.length-1]};
 };
 type Row=typeof rows[number];
 const summary=(run:{route:string;phase:Row['phase'];startedAt:number;endedAt:number;paints:number;rows:Row[]})=>({
  route:run.route,phase:run.phase,startedAt:run.startedAt,endedAt:run.endedAt,spanMs:Math.max(0,run.endedAt-run.startedAt),
  paints:run.paints,samples:run.rows.length,draw:stats(run.rows.map(r=>r.draw)),raf:stats(run.rows.flatMap(r=>r.interval===undefined?[]:[r.interval]))
 });
 // One bounded active ring and one numeric summary per allowlisted route/phase.
 // Idle cannot overwrite a short greeting before the diagnostics are opened.
 const completed=new Map<string,ReturnType<typeof summary>>();
 let run:({route:string;phase:Row['phase'];startedAt:number;endedAt:number;paints:number;rows:Row[];cursor:number})|undefined;
 const finish=()=>{if(run){completed.set(run.route+':'+run.phase,summary(run));run=undefined;}};
 return {
  record(at:number,draw:number,raf:number|undefined,key:string,phaseValue?:unknown){
   if(!Number.isFinite(at)||!Number.isFinite(draw)||draw<0||raf!==undefined&&!Number.isFinite(raf))return;
   const interval=raf!==undefined&&lastRAF!==undefined&&raf>lastRAF?raf-lastRAF:undefined;
   if(raf!==undefined)lastRAF=raf;
   const route=knownRoutes.has(key)?key:'fallback';
   const phase=route==='fallback'?'unclassified':foxAnimationPhase(phaseValue);
   rows[cursor]={at,draw,interval,route,phase};cursor=(cursor+1)%capacity;
   if(run?.route!==route||run?.phase!==phase){finish();run={route,phase,startedAt:at,endedAt:at,paints:0,rows:[],cursor:0};}
   run!.rows[run!.cursor]={at,draw,interval:run!.paints?interval:undefined,route,phase};
   run!.cursor=(run!.cursor+1)%capacity;run!.paints++;run!.endedAt=at;
  },
  pause(){lastRAF=undefined;finish();},
  snapshot(now:number){
   const latest=rows.length?rows[(cursor+rows.length-1)%rows.length]:undefined;
   return {samples:rows.length,ageMs:latest?Math.max(0,now-latest.at):null,
    routes:[...new Set(rows.map(r=>r.route))].sort(),
    phases:[...new Set(rows.map(r=>r.phase))].sort(),
    draw:stats(rows.map(r=>r.draw)),raf:stats(rows.flatMap(r=>r.interval===undefined?[]:[r.interval])),
    completedRuns:[...completed.values()].map(r=>({...r,ageMs:Math.max(0,now-r.endedAt)})).sort((a,b)=>b.endedAt-a.endedAt)};
  }
 };
}
export function createFoxSurfaceTiming(capacity=600){
 const collectors={world:createFoxFrameTiming(capacity),desktop:createFoxFrameTiming(capacity)};
 const lifecycle:{at:number;surface:'world'|'desktop';hidden:boolean;focused:boolean}[]=[];
 let previous:'world'|'desktop'|undefined;
 return {
  observe(at:number,surface:'world'|'desktop',hidden:boolean,focused:boolean){
   if(!Number.isFinite(at)||typeof hidden!=='boolean'||typeof focused!=='boolean'||!['world','desktop'].includes(surface))return;
   const last=lifecycle.at(-1);
   if(last&&last.surface===surface&&last.hidden===hidden&&last.focused===focused)return;
   lifecycle.push({at,surface,hidden,focused});if(lifecycle.length>12)lifecycle.shift();
  },
  record(at:number,draw:number,raf:number|undefined,key:string,surface:'world'|'desktop',phase?:unknown){
   if(previous!==surface){collectors.world.pause();collectors.desktop.pause();previous=surface;}
   collectors[surface].record(at,draw,raf,key,phase);
  },
  pause(){collectors.world.pause();collectors.desktop.pause();},
  snapshot(now:number){
   const events=(surface:'world'|'desktop')=>lifecycle.filter(e=>e.surface===surface).map(e=>({...e,ageMs:Math.max(0,now-e.at)}));
   return {world:{...collectors.world.snapshot(now),lifecycle:events('world')},desktop:{...collectors.desktop.snapshot(now),lifecycle:events('desktop')}};
  }
 };
}
type Timing=ReturnType<typeof createFoxSurfaceTiming>;
type FrameStats=ReturnType<ReturnType<typeof createFoxFrameTiming>['snapshot']>['draw'];
const portraits=new WeakMap<Element,Timing>();
export function registerFoxFrameTiming(canvas:HTMLCanvasElement,timing:Timing){
 portraits.set(canvas,timing);return ()=>portraits.delete(canvas);
}
export function foxFrameTimingText(root:ParentNode=document){
 const canvas=root.querySelector('.companion-avatar canvas.companion-model');
 const reports=canvas?portraits.get(canvas)?.snapshot(performance.now()):undefined;
 if(!reports||!reports.world.samples&&!reports.desktop.samples)return 'Fox animation timing: no Dev samples yet.';
 const format=(name:string,value:FrameStats)=>value?`${name} (${value.count} samples): median ${value.median.toFixed(1)} ms · p95 ${value.p95.toFixed(1)} ms · max ${value.max.toFixed(1)} ms.`:`${name}: no RAF samples yet.`;
 const sections=Object.entries(reports).filter(([,report])=>report.samples).map(([surface,report])=>{
  const visibility=report.lifecycle.map(e=>`${(e.ageMs/1000).toFixed(1)} s ago · ${e.hidden?'document hidden':'document visible'} · ${e.focused?'focused':'unfocused'}`).join('\n');
  const runs=report.completedRuns.slice(0,6).map(run=>`${run.route.replace('anatomy-v1:','')} / ${run.phase} · ${run.paints} paints over ${(run.spanMs/1000).toFixed(1)} s · ${(run.ageMs/1000).toFixed(1)} s ago${run.samples<run.paints?` · last ${run.samples} sampled`:''}\n${format('RAF delivery',run.raf)}\n${format('CPU draw',run.draw)}`).join('\n');
  return `${surface==='world'?'World':'Desktop'} · last ${report.samples} paints${report.ageMs!>1000?' · stale (not currently painting)':''}.\n${format('RAF delivery',report.raf)}\n${format('CPU draw',report.draw)}\nRoutes: ${report.routes.join(', ')}. Phases: ${report.phases.join(', ')}.${visibility?'\nRecent page visibility/focus (12 changes shared across surfaces; not native occlusion):\n'+visibility:''}${runs?'\nCompleted segments (latest per route/phase):\n'+runs:''}`;
 });
 return `Fox animation timing\n${sections.join('\n\n')}\nLocal Dev sample only; draw time excludes asynchronous GPU presentation. Not uploaded.`;
}

/** Separate accessible text nodes: a single multi-kilobyte status text is
 * truncated by native inspection, hiding later physical-phase evidence. */
export function renderFoxFrameTiming(target:HTMLElement,root:ParentNode=document){
 const lines=foxFrameTimingText(root).split('\n').filter(Boolean);
 target.replaceChildren(...lines.map(text=>{
  const line=target.ownerDocument.createElement('span');
  line.style.display='block';line.style.overflowWrap='anywhere';line.textContent=text;
  return line;
 }));
}
