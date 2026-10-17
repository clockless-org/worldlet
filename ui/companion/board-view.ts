import type {BoardBlockView,BoardView} from '../../contracts/board.ts';
import {agentEl as el,agentButton,type AgentCall} from './agent-change.ts';

const number=(value:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(value);
const percent=(value:number|null)=>value===null?'—':number(value*100)+'%';
const link=(title:string,href:string)=>{
 const text=el('span','',title);
 try{const url=new URL(href);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return text;
  const a=el('a','',title) as HTMLAnchorElement;a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a;
 }catch{return text;}
};
function table(headings:string[],rows:string[][]){
 const result=el('table'),head=el('thead'),body=el('tbody'),header=el('tr');
 for(const title of headings){const th=el('th','',title);th.setAttribute('scope','col');header.append(th);}head.append(header);
 for(const values of rows){const row=el('tr');for(const value of values)row.append(el('td','',value));body.append(row);}
 result.append(head,body);return result;
}
function blockView(block:BoardBlockView){
 const card=el('article','companion-board-block');card.dataset.block=block.id;
 card.append(el('h5','',block.title));
 if(block.provider)card.append(el('p','companion-settings-quiet',block.provider+(block.scope?' · '+block.scope:'')));
 if(block.status==='error'){card.append(el('p','companion-board-error',block.error||'This block is unavailable.'));return card;}
 if(block.number){const value=el('p','companion-board-number',number(block.number.value));if(block.number.tone){value.dataset.tone=block.number.tone;value.append(el('span','companion-settings-quiet',block.number.tone==='good'?'Within target':'Outside target'));}card.append(value);}
 if(block.funnel){card.append(table(['Step','Count','From previous'],block.funnel.steps.map(step=>[step.label,number(step.count),percent(step.rate)])),el('p','companion-info-note','Overall conversion: '+percent(block.funnel.overall)));}
 if(block.list){
  const list=el('ul');
  for(const item of block.list.items){const row=el('li');row.append(link(item.title,item.url));for(const [name,value] of Object.entries(item.fields))row.append(el('span','companion-settings-quiet',`${name}: ${value}`));list.append(row);}
  card.append(block.list.items.length?list:el('p','companion-info-note','No records.'));
  if(block.list.more)card.append(el('p','companion-info-note','More records are available from the source.'));
 }
 if(block.trend){
  const trend=block.trend;card.append(el('p','companion-board-number',number(trend.latest)),el('p','companion-info-note',trend.change===null?'One value; no previous comparison.':`Change from previous: ${trend.change>0?'+':''}${number(trend.change)}`));
  // The host resolves values; the UI only positions the already-resolved points for display.
  const values=trend.points.map(p=>p.y),min=Math.min(...values),max=Math.max(...values),span=max-min;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'polyline');
  svg.setAttribute('viewBox','0 0 300 90');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${block.title}: ${trend.points.length} values; latest ${number(trend.latest)}`);
  line.setAttribute('points',trend.points.map((p,i)=>`${10+(trend.points.length>1?i/(trend.points.length-1)*280:140)},${span?80-(p.y-min)/span*70:45}`).join(' '));svg.append(line);
  const details=el('details'),scroll=el('div','companion-board-values');details.append(el('summary','','Show values'));scroll.append(table(['Period','Value'],trend.points.map(p=>[p.x,number(p.y)])));details.append(scroll);card.append(svg,details);
 }
 return card;
}

/** The owner's read-only board. All data comes from the existing authorized host action. No timer, definition,
 * connection, grant or provider write is created by opening, switching tabs or refreshing this view. */
export async function showBoard(target:HTMLElement,call:AgentCall,current:()=>boolean){
 const box=el('section','companion-board'),status=el('p','companion-settings-status'),content=el('div');status.setAttribute('role','status');
 let generation=0,selected='';
 const refresh=agentButton('Refresh board','refresh-board',load);box.append(refresh,status,content);target.append(box);
 function render(view:BoardView){
  if(!view.tabs.some(tab=>tab.id===selected))selected=view.tabs[0]?.id??'';
  const tabs=el('nav','companion-board-tabs');tabs.setAttribute('aria-label','Board tabs');
  for(const tab of view.tabs){const b=agentButton(tab.title,'board-tab',()=>{selected=tab.id;render(view);});b.setAttribute('aria-pressed',String(selected===tab.id));tabs.append(b);}
  const tab=view.tabs.find(tab=>tab.id===selected),blocks=el('div','companion-board-blocks');
  blocks.append(...tab?.blocks.length?tab.blocks.map(blockView):[el('p','companion-info-note','This tab has no blocks yet.')]);
  const at=Date.parse(view.resolvedAt),checked=Number.isFinite(at)?new Date(at).toLocaleString():'Unknown';
  content.replaceChildren(el('h4','',view.title),tabs,el('p','companion-settings-quiet',`View checked: ${checked}. Service reads may be reused for up to one minute.`),blocks);
 }
 async function load(){
  const turn=++generation;refresh.disabled=true;status.textContent='Reading board…';
  try{
   const result=await call('board',{operation:'read'});
   if(!current()||turn!==generation)return;
   if(result?.error)throw Error(result.error);
   if(result?.view===null){content.replaceChildren(el('p','companion-info-note','No board yet. Ask an Agent to set it up after allowing board setup in Agent → Access.'));}
   else if(result?.view&&Array.isArray(result.view.tabs))render(result.view);
   else throw Error('The board is unavailable.');
   status.textContent='';
  }catch(error){if(current()&&turn===generation){content.replaceChildren();status.textContent=(error as Error).message||'The board is unavailable.';}}
  finally{if(current()&&turn===generation)refresh.disabled=false;}
 }
 await load();
}
