import {scaledAmount,type ArtifactBlock,type ArtifactAction} from '../../core/artifacts/index.ts';
import {uiIcon} from '../components/index.ts';
import {attentionSceneArt,attentionSceneIds} from '../attention/index.ts';
import {ACTIVE_THEME,attentionPicture} from '../themes/index.ts';
/** An answer's picture, as an Attention card's (ui/artifacts/CARD-SYSTEM.md): the painted scene Fox named, else the one
 * its title and body match, else the general picture of its tone; none when Fox asked for a plain card. */
export function artifactPicture({title='',body='',art,tone}:{title?:string;body?:string;art?:string|null;tone?:string|null}):string|null {
 if(art==='none')return null;
 const fallback=tone==='teal'?'coming-up':tone==='honey'||tone==='clay'?'do-something':'worth-knowing';
 const name=art&&attentionSceneIds.has(art)?'scene-'+art:attentionSceneArt({title,summary:String(body).slice(0,400),image:fallback});
 return attentionPicture(name,ACTIVE_THEME.pack.id,fallback);
}
// A fact row's icon is the Attention card's own line icon for its time and venue lines (ui/artifacts/CARD-SYSTEM.md).
const FACT_ICONS={time:'clock',place:'map',cost:'coins',person:'people',link:'link',note:'note'};
// The parts of an artifact the person works with in place (core/artifacts/README.md#blocks). They are Worldlet's own
// components in the Attention card's design (owner Order 2026-10-08: "attention card就是我们标准的design system"): the
// accent label, the card's ink and paper, and its outline and filled buttons. Fox only fills them in; nothing here is
// HTML Fox wrote, and nothing changes the World. `live` is the card in the World; the Journal draws them still.
const el=(tag:string,className?:string,text?:string)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e;};
const number=(v:number)=>Number.isInteger(v)?String(v):v.toLocaleString(undefined,{maximumFractionDigits:2});

export function renderArtifactBlocks(blocks:ArtifactBlock[],{live=false,onChange=(_blocks:ArtifactBlock[])=>{},onRequest=(_action:ArtifactAction)=>{}}:{live?:boolean;onChange?:(blocks:ArtifactBlock[])=>void;onRequest?:(action:ArtifactAction)=>void}={}):HTMLElement {
 const holder=el('div','artifact-blocks');
 const state=blocks.map(b=>({...b}));
 const changed=()=>onChange(state.map(b=>({...b})));
 state.forEach((block,index)=>{
  const part=el('section','artifact-block');part.dataset.type=block.type;
  const id='artifact-block-'+Math.random().toString(36).slice(2,9);
  const label=el('h4','artifact-block-label',block.label);label.id=id;part.setAttribute('aria-labelledby',id);part.append(label);
  if(block.type==='checklist'){
   const list=el('ul','artifact-checklist');const done=new Set(block.done||[]);
   const count=el('span','artifact-block-count');const tally=()=>{count.textContent=done.size+' / '+block.items.length;};tally();label.append(count);
   block.items.forEach((item,i)=>{
    const row=el('li');row.dataset.done=String(done.has(i));
    if(live){
     const box=el('label','artifact-check');const input=document.createElement('input');input.type='checkbox';input.checked=done.has(i);
     input.onchange=()=>{input.checked?done.add(i):done.delete(i);row.dataset.done=String(input.checked);tally();state[index]={...block,done:[...done].sort((a,b)=>a-b)};changed();};
     box.append(input,el('span','artifact-check-mark'),el('span','artifact-check-text',item));row.append(box);
    }else row.append(el('span','artifact-check-mark'),el('span','artifact-check-text',item));
    list.append(row);
   });
   part.append(list);
  }
  if(block.type==='scale'){
   let value=block.value??block.base;
   const control=el('div','artifact-scale');const shown=el('output','artifact-scale-value');shown.setAttribute('aria-live','polite');
   const table=el('table','artifact-scale-rows'),body=el('tbody');table.append(body);
   const draw=()=>{shown.textContent=number(value)+(block.unit?' '+block.unit:'');body.replaceChildren(...block.rows.map(r=>{const tr=el('tr');tr.append(el('td','',r.label),el('td','artifact-scale-amount',number(scaledAmount(r.amount,block.base,value))+(r.unit?' '+r.unit:'')));return tr;}));};
   if(live){
    const step=(sign:number)=>{const next=Math.round((value+sign*block.step)*1000)/1000;if(next<block.min||next>block.max)return;value=next;draw();less.disabled=value-block.step<block.min;more.disabled=value+block.step>block.max;state[index]={...block,value};changed();};
    const less=el('button','attention-preview-action artifact-scale-step','−') as HTMLButtonElement,more=el('button','attention-preview-action artifact-scale-step','+') as HTMLButtonElement;
    less.type=more.type='button';less.setAttribute('aria-label','Fewer '+(block.unit||block.label));more.setAttribute('aria-label','More '+(block.unit||block.label));
    less.onclick=()=>step(-1);more.onclick=()=>step(1);less.disabled=value-block.step<block.min;more.disabled=value+block.step>block.max;
    control.append(less,shown,more);
   }else control.append(shown);
   draw();part.append(control,table);
  }
  if(block.type==='choice'){
   const options=el('div','artifact-choice');options.setAttribute('role','group');options.setAttribute('aria-labelledby',id);
   for(const option of block.options){
    if(live){const b=el('button','attention-preview-action',option.label) as HTMLButtonElement;b.type='button';b.onclick=()=>onRequest(option);options.append(b);}
    else options.append(el('span','attention-preview-action',option.label));
   }
   part.append(options);
  }
  if(block.type==='parts'){
   const names=el('div','artifact-parts');const detail=el('p','artifact-part-detail');let chosen=0;
   const tabs:HTMLElement[]=[];
   const choose=(i:number)=>{chosen=i;detail.textContent=block.parts[i].detail;tabs.forEach((t,j)=>{t.className='attention-preview-action'+(j===i?' attention-preview-action-primary':'');t.setAttribute('aria-pressed',String(j===i));});};
   block.parts.forEach((p,i)=>{const t=el(live?'button':'span','',p.name);if(live){(t as HTMLButtonElement).type='button';t.onclick=()=>choose(i);}tabs.push(t);names.append(t);});
   if(live){names.setAttribute('role','group');names.setAttribute('aria-labelledby',id);names.addEventListener('keydown',e=>{const k=(e as KeyboardEvent).key;if(k!=='ArrowRight'&&k!=='ArrowLeft')return;e.preventDefault();const i=(chosen+(k==='ArrowRight'?1:tabs.length-1))%tabs.length;choose(i);tabs[i].focus();});}
   choose(0);part.append(names,detail);
  }
  // Showing blocks (ui/artifacts/CARD-SYSTEM.md): the same in the World and the Journal.
  if(block.type==='callout'){part.dataset.tone=block.tone;part.append(el('p','artifact-callout',block.text));}
  if(block.type==='stats'){const tiles=el('div','artifact-stats');for(const item of block.items){const tile=el('div','artifact-stat');tile.append(el('strong','artifact-stat-value',item.value),el('span','artifact-stat-label',item.label));if(item.note)tile.append(el('span','artifact-stat-note',item.note));tiles.append(tile);}part.append(tiles);}
  if(block.type==='facts'){const rows=el('ul','artifact-facts');for(const row of block.rows){const li=el('li'),icon=el('span','artifact-fact-icon');icon.innerHTML=uiIcon(FACT_ICONS[row.icon]);li.dataset.icon=row.icon;li.append(icon,el('span','',row.text));rows.append(li);}part.append(rows);}
  if(block.type==='steps'){const list=el('ol','artifact-steps');block.items.forEach((item,i)=>{const li=el('li'),mark=el('span','artifact-step-mark',String(i+1)),text=el('div','artifact-step-text'),head=el('div','artifact-step-head');head.append(el('strong','',item.title));if(item.when)head.append(el('span','artifact-step-when',item.when));text.append(head);if(item.detail)text.append(el('span','artifact-step-detail',item.detail));li.append(mark,text);list.append(li);});part.append(list);}
  if(block.type==='compare'){const grid=el('div','artifact-compare');grid.style.setProperty('--columns',String(block.options.length));for(const option of block.options){const col=el('div','artifact-option');if(option.pick){col.dataset.pick='true';col.append(el('span','artifact-option-pick','Recommended'));}col.append(el('strong','artifact-option-name',option.name));if(option.note)col.append(el('span','artifact-option-note',option.note));if(option.points.length){const ul=el('ul');for(const point of option.points)ul.append(el('li','',point));col.append(ul);}grid.append(col);}part.append(grid);}
  if(block.type==='tags'){const tags=el('div','artifact-tags');for(const tag of block.items)tags.append(el('span','artifact-tag',tag));part.append(tags);}
  holder.append(part);
 });
 return holder;
}
