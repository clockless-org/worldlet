// Artifacts (owner decisions 2026-10-05 and 2026-10-06): every card Fox puts in front of the person is an artifact,
// an information card with a size. An Attention card is one kind; an explanation Fox shows in conversation is another.
// Each is kept in this World so the person can find it again in the Artifacts page of Fox's panel. These are the
// rules every host applies (core/artifacts/README.md).

export type ArtifactKind='attention'|'answer';
export type ArtifactSize='small'|'medium'|'large';
export type ArtifactChart={title:string;unit:string;values:{label:string;value:number}[]};
/** Where an artifact came from: the World item an Attention card shows, or the conversation (and place) Fox spoke in. */
/** A button on the card that asks Fox, in the person's name, to do the next step: the click is their request. */
export type ArtifactAction={label:string;request:string};
export type ArtifactOrigin={type:'attention';item:string}|{type:'conversation';place:string};
/** A part of the card the person works with in place (owner Order 2026-10-08, "我们自己做…attention card就是我们标准的design
 * system"): Worldlet's own components, drawn by the host in the Attention card's style, never HTML Fox writes. A checklist
 * keeps what is ticked; a scale recomputes amounts for a count (a recipe for six); a choice drafts the person's answer in
 * Fox's message bar like an action; parts show one part's detail at a time (a bicycle's five systems). None of them
 * changes anything in the World. */
export type ArtifactBlock=
 {type:'checklist';label:string;items:string[];done?:number[]}
 |{type:'scale';label:string;unit:string;base:number;value?:number;min:number;max:number;step:number;rows:{label:string;amount:number;unit:string}[]}
 |{type:'choice';label:string;options:ArtifactAction[]}
 |{type:'parts';label:string;parts:{name:string;detail:string}[]}
 |{type:'callout';label:string;text:string;tone:ArtifactTone}
 |{type:'stats';label:string;items:{value:string;label:string;note:string}[]}
 |{type:'facts';label:string;rows:{icon:ArtifactFactIcon;text:string}[]}
 |{type:'steps';label:string;items:{title:string;detail:string;when:string}[]}
 |{type:'compare';label:string;options:{name:string;note:string;points:string[];pick:boolean}[]}
 |{type:'tags';label:string;items:string[]};
/** The card system's tones (ui/artifacts/CARD-SYSTEM.md): the Attention card's own accents, one per kind of thing, so a
 * card's colour says what it is about. Moss is an answer's default. */
export const ARTIFACT_TONES=['moss','teal','honey','sage','clay','plum'] as const;
export type ArtifactTone=typeof ARTIFACT_TONES[number];
/** The line icons a fact row may carry, the Attention card's own (its time and venue lines). */
export const ARTIFACT_FACT_ICONS=['time','place','cost','person','link','note'] as const;
export type ArtifactFactIcon=typeof ARTIFACT_FACT_ICONS[number];
export interface Artifact {
 id:string;kind:ArtifactKind;title:string;
 /** Markdown. An Attention card keeps the summary it showed; the World item stays the truth. */
 body:string;
 /** Answer only: the content at the card's other sizes (core/artifacts/README.md#fits-its-card): `brief` is the whole
  * answer in one sentence for a card too small for the body, `detail` a fuller body for a card with room to spare. */
 brief?:string;detail?:string;chart:ArtifactChart|null;size:ArtifactSize;origin:ArtifactOrigin;
 /** Answer only: up to three next steps Fox offered (core/artifacts/README.md#actions). */
 actions:ArtifactAction[];
 /** Answer only: up to two interactive blocks under the body (core/artifacts/README.md#blocks). */
 blocks?:ArtifactBlock[];
 /** Answer only: the card's tone and its picture, a painted scene's ID or none; without one the card picks a scene that
  * matches its title, as an Attention card does. */
 tone?:ArtifactTone;art?:string;
 /** Attention only: its category ("Coming Up", "Worth Doing", "Worth Knowing"). */
 category?:string;
 /** Seconds since 1970. */
 createdAt:number;updatedAt:number;
}
export const ARTIFACT_LIMITS=Object.freeze({artifacts:500,title:80,body:12000,chartValues:8,chartLabel:60,category:40,place:200,brief:160,actions:3,actionLabel:40,actionRequest:300,blocks:3,blockLabel:60,calloutText:220,stats:4,statValue:14,statLabel:40,facts:5,steps:6,stepTitle:60,stepDetail:120,stepWhen:20,compare:3,comparePoints:3,comparePoint:70,tags:8,tagText:24,checklistItems:8,itemText:100,scaleRows:8,choiceOptions:4,parts:6,partName:30,partDetail:280});

const clip=(value:unknown,count:number)=>typeof value==='string'?[...value.trim()].slice(0,count).join(''):'';
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const ID=/^(art-[a-z0-9]{12}|attention-[A-Za-z0-9:_.-]{1,160})$/;

/** A new answer artifact's ID: short, file-name safe and unique enough within one World. */
export function artifactId(random:()=>number=Math.random):string {
 const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
 return 'art-'+Array.from({length:12},()=>alphabet[Math.floor(random()*alphabet.length)]).join('');
}
/** An Attention card's artifact follows its World item: opening it again updates the same artifact. */
export const attentionArtifactId=(item:string)=>'attention-'+item.replace(/[^A-Za-z0-9:_.-]/g,'_').slice(0,160);
export const validArtifactId=(id:unknown):id is string=>typeof id==='string'&&ID.test(id);

/** Three sizes (owner decision 2026-10-07, the Journal): a few lines are small; a table, a chart or more than a few
 * lines medium; more than a medium card holds large. This is Worldlet's choice when Fox names none. */
export function defaultArtifactSize(body:string,chart:unknown,blocks?:unknown):ArtifactSize {
 const weight=artifactWeight(body,chart as any,blocks);
 return weight>ARTIFACT_CARD.medium?'large':chart||(Array.isArray(blocks)&&blocks.length)||/^\s*\|.*\|\s*$/m.test(body)||weight>ARTIFACT_CARD.small?'medium':'small';
}
const SIZES:ArtifactSize[]=['small','medium','large'];
/** The size a card shows at: the one Fox (or the person) named, else the one its content needs. A card smaller than its
 * content shows less of it (artifactFitSteps, owner Order 2026-10-09), so a named size is kept as it is. */
export function artifactSizeFor(named:unknown,body:string,chart:unknown,blocks?:unknown):ArtifactSize {
 return SIZES.includes(named as ArtifactSize)?named as ArtifactSize:defaultArtifactSize(body,chart,blocks);
}

/** One card at most (owner Order 2026-10-07): an artifact is what fits on its card, never pages. It never scrolls either
 * (owner Order 2026-10-09): Fox writes it at three lengths and the card shows the fullest that fits (artifactFitSteps).
 * `show_artifact` refuses a body or detail past the large card's budget so Fox cuts it and shows it again.
 * Weights approximate the space text takes: a wide (CJK) character counts two, every line or table row twenty for
 * the room it leaves, a chart's bar forty. A medium card holds about half a large one, a small card a few lines. */
export const ARTIFACT_CARD=Object.freeze({small:360,medium:900,large:1800});
export const ARTIFACT_ONE_CARD_RULE='An artifact is one card, never longer: it never scrolls or turns to a second page. '
 +'Use one layout every time: one or two lines with the takeaway first, then at most three short parts, each a bold label line with a few lines or bullets, '
 +'or one table of up to six rows and four short columns; no headings beyond a bold label, no nested lists. '
 +`Keep the body under about ${ARTIFACT_CARD.small} characters for small, ${ARTIFACT_CARD.medium} for medium and ${ARTIFACT_CARD.large} for large, counting a Chinese, Japanese or Korean character as two. `
 +'Choose what matters and cut the rest; never continue on another card. '
 +`The card shows as much as its size holds, so write it at three lengths: brief, the whole answer in one sentence (up to ${ARTIFACT_LIMITS.brief} characters, no Markdown), shown when the card is small; `
 +'the body; and, when there is more worth reading, detail, a fuller body in the same layout for a large card, or null. '
 +'List blocks most important first: a smaller card leaves out the last ones.';
const WIDE=/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;
/** How much of a card a body and chart take, in ARTIFACT_CARD units. */
export function artifactWeight(body:string,chart?:{values?:unknown[]}|null,blocks?:unknown):number {
 let weight=0;
 for(const line of String(body||'').split('\n')){
  if(/^\s*\|?[\s:|-]+\|?\s*$/.test(line)&&line.includes('-'))continue;
  const text=line.replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[|*_#>`]/g,'').replace(/\s+/g,' ').trim();
  if(!text)continue;
  weight+=20;
  for(const ch of text)weight+=WIDE.test(ch)?2:1;
 }
 return Math.round(weight+(Array.isArray(chart?.values)?60+40*chart.values.length:0)+blocksWeight(blocks));
}
const textWeight=(text:unknown)=>{let w=0;for(const ch of String(text||''))w+=WIDE.test(ch)?2:1;return w;};
/** The room blocks take, measured against the card as a line of text is: a block's label is a short line, and each
 * checklist item, amount, row of buttons or part's detail stands on its own ruled line, about a full line of text. */
function blocksWeight(blocks:unknown):number {
 if(!Array.isArray(blocks))return 0;
 const line=(text:unknown)=>100+textWeight(text)/2;
 let weight=0;
 for(const b of blocks as any[]){
  weight+=70;
  if(b?.type==='checklist')for(const item of b.items||[])weight+=line(item);
  if(b?.type==='scale')weight+=100+(b.rows||[]).reduce((w,r)=>w+line(r?.label),0);
  if(b?.type==='choice')weight+=100*Math.ceil((b.options||[]).length/3);
  if(b?.type==='parts')weight+=100*Math.ceil((b.parts||[]).length/4)+Math.max(100,...(b.parts||[]).map(p=>line(p?.detail)));
  if(b?.type==='callout')weight+=60+textWeight(b.text);
  if(b?.type==='stats')weight+=300;
  if(b?.type==='facts')for(const row of b.rows||[])weight+=70+textWeight(row?.text)/2;
  if(b?.type==='steps')for(const item of b.items||[])weight+=line(item?.title)+(item?.detail?60+textWeight(item.detail)/2:0);
  if(b?.type==='compare')weight+=200+Math.max(0,...(b.options||[]).map(o=>(o?.note?60+textWeight(o.note)/2:0)+(o?.points||[]).reduce((w,p)=>w+90+textWeight(p)/3,0)));
  if(b?.type==='tags')weight+=60*Math.ceil((b.items||[]).length/5);
 }
 return weight;
}
/** A body Fox wrote that would not fit one card: the reason, so Fox shortens it. Stored artifacts are not checked. */
export function artifactFitProblem(args:any):string|null {
 for(const [field,text] of [['body',args?.body],['detail',args?.detail]] as const){
  if(field==='detail'&&typeof text!=='string')continue;
  const weight=artifactWeight(text,args?.chart,args?.blocks);
  if(weight<=ARTIFACT_CARD.large)continue;
  const cut=Math.ceil((1-ARTIFACT_CARD.large/weight)*100);
  return `Too long for one card (${field==='detail'?'the detail, ':''}about ${weight} of ${ARTIFACT_CARD.large}): an artifact is at most one card. Cut about ${cut}% — keep the takeaway, at most three short parts or one table of up to six rows — and call show_artifact again.`;
 }
 return null;
}

/** What a card holds at one size: which text (the detail, the body or the one-sentence brief), how many of its blocks
 * (the first ones, most important first) and whether its chart. */
export type ArtifactFitStep={text:'detail'|'body'|'brief';blocks:number;chart:boolean};
/** Fits its card (owner Order 2026-10-09: never scroll, show as much as the card's size holds): the steps a card tries,
 * fullest first, and it shows the first that fits without scrolling. The detail, then the body with every block; then
 * the last blocks are left out one at a time, then the chart, and last the brief alone. Nothing calls a model: a card
 * that changes size only picks another step. */
export function artifactFitSteps(a:{body?:string;detail?:string|null;blocks?:unknown[]|null;chart?:unknown}):ArtifactFitStep[] {
 const blocks=Array.isArray(a.blocks)?a.blocks.length:0,chart=!!a.chart,steps:ArtifactFitStep[]=[];
 if(typeof a.detail==='string'&&a.detail.trim())steps.push({text:'detail',blocks,chart});
 for(let n=blocks;n>=0;n--)steps.push({text:'body',blocks:n,chart});
 if(chart)steps.push({text:'body',blocks:0,chart:false});
 steps.push({text:'brief',blocks:0,chart:false});
 return steps;
}
/** The one sentence a card shows when nothing more fits: Fox's brief, or else the body's first sentence (an Attention
 * card, or an artifact kept before briefs). */
export function artifactBrief(a:{brief?:string|null;body?:string}):string {
 if(typeof a.brief==='string'&&a.brief.trim())return clip(a.brief,ARTIFACT_LIMITS.brief);
 const lines=String(a.body||'').split('\n').filter(line=>line.trim()&&!/^[\s:|-]+$/.test(line));
 const first=lines.find(line=>!/^\s*#/.test(line))||lines[0]||'';
 const plain=first.replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^\s*(#+|[-*+>]|\d+[.)])\s*/,'').replace(/[|*_`]/g,' ').replace(/\s+/g,' ').trim();
 const sentence=plain.match(/^.+?(?:[.!?](?=\s|$)|[。！？])/u)?.[0]||plain;
 return [...sentence].length>ARTIFACT_LIMITS.brief?[...sentence].slice(0,ARTIFACT_LIMITS.brief-1).join('')+'…':sentence;
}

/** What `show_artifact` may present; the reason when it may not. */
export function artifactInputProblem(args:any):string|null {
 if(typeof args?.title!=='string'||!args.title.trim()||args.title.length>ARTIFACT_LIMITS.title||typeof args.body!=='string'||args.body.length>ARTIFACT_LIMITS.body)
  return `Provide a title up to ${ARTIFACT_LIMITS.title} characters and Markdown up to ${ARTIFACT_LIMITS.body} characters.`;
 if(args.brief!=null&&(typeof args.brief!=='string'||[...args.brief.trim()].length>ARTIFACT_LIMITS.brief))return `Brief is one sentence up to ${ARTIFACT_LIMITS.brief} characters, or null.`;
 if(args.detail!=null&&(typeof args.detail!=='string'||args.detail.length>ARTIFACT_LIMITS.body))return `Detail is Markdown up to ${ARTIFACT_LIMITS.body} characters, or null.`;
 const c=args.chart;
 if(c&&(!Array.isArray(c.values)||!c.values.length||c.values.length>ARTIFACT_LIMITS.chartValues||c.values.some(v=>typeof v?.label!=='string'||v.label.length>ARTIFACT_LIMITS.chartLabel||!Number.isFinite(v.value)||v.value<0)))
  return 'Provide up to eight labeled, nonnegative chart values.';
 if(args.size!=null&&!['small','medium','large'].includes(args.size))return 'Size is small, medium or large.';
 const a=args.actions;
 if(a!=null&&(!Array.isArray(a)||a.length>ARTIFACT_LIMITS.actions||a.some(x=>typeof x?.label!=='string'||!x.label.trim()||x.label.length>ARTIFACT_LIMITS.actionLabel||typeof x.request!=='string'||!x.request.trim()||x.request.length>ARTIFACT_LIMITS.actionRequest)))
  return `Provide up to ${ARTIFACT_LIMITS.actions} actions, each a label up to ${ARTIFACT_LIMITS.actionLabel} characters and a request up to ${ARTIFACT_LIMITS.actionRequest}.`;
 const b=args.blocks;
 if(b!=null&&(!Array.isArray(b)||b.length>ARTIFACT_LIMITS.blocks||readArtifactBlocks(b).length!==b.length))
  return `Provide up to ${ARTIFACT_LIMITS.blocks} blocks the card can draw: checklist (up to ${ARTIFACT_LIMITS.checklistItems} items), scale (a count from min to max with up to ${ARTIFACT_LIMITS.scaleRows} amounts for its base), choice (2 to ${ARTIFACT_LIMITS.choiceOptions} options), parts (2 to ${ARTIFACT_LIMITS.parts}), callout (a line and a tone), stats (2 to ${ARTIFACT_LIMITS.stats} figures), facts (up to ${ARTIFACT_LIMITS.facts} rows, each an icon of ${ARTIFACT_FACT_ICONS.join(', ')}), steps (2 to ${ARTIFACT_LIMITS.steps}), compare (2 or ${ARTIFACT_LIMITS.compare} options, at most one picked) or tags (up to ${ARTIFACT_LIMITS.tags}); keep every text within its limit.`;
 if(args.tone!=null&&!ARTIFACT_TONES.includes(args.tone))return `Tone is one of ${ARTIFACT_TONES.join(', ')}.`;
 if(args.art!=null&&!validArtifactArt(args.art))return 'Art is a painted scene\'s ID, "none", or null to let the card choose.';
 return null;
}

function readChart(value:any):ArtifactChart|null {
 if(!value||typeof value!=='object'||!Array.isArray(value.values))return null;
 const values=value.values.slice(0,ARTIFACT_LIMITS.chartValues).flatMap(v=>{const n=finite(v?.value);return typeof v?.label==='string'&&n!==null&&n>=0?[{label:clip(v.label,ARTIFACT_LIMITS.chartLabel),value:n}]:[];});
 return values.length?{title:clip(value.title,ARTIFACT_LIMITS.title),unit:clip(value.unit,20),values}:null;
}
/** The actions a card offers, checked; anything else is dropped. */
export function readArtifactActions(value:unknown):ArtifactAction[] {
 return (Array.isArray(value)?value:[]).slice(0,ARTIFACT_LIMITS.actions).flatMap(a=>{const label=clip(a?.label,ARTIFACT_LIMITS.actionLabel),request=clip(a?.request,ARTIFACT_LIMITS.actionRequest);return label&&request?[{label,request}]:[];});
}
const text=(value:unknown,count:number)=>typeof value==='string'&&value.trim()&&[...value.trim()].length<=count?value.trim():null;
/** One block, checked: null when any part of it is not what the card can draw. What the person ticked or set is kept. */
function readBlock(b:any):ArtifactBlock|null {
 const L=ARTIFACT_LIMITS,label=text(b?.label,L.blockLabel);
 if(!label)return null;
 if(b.type==='checklist'){
  const items=Array.isArray(b.items)&&b.items.length&&b.items.length<=L.checklistItems?b.items.map(i=>text(i,L.itemText)):[];
  if(!items.length||items.includes(null))return null;
  const done=Array.isArray(b.done)?[...new Set(b.done.filter(i=>Number.isInteger(i)&&i>=0&&i<items.length))] as number[]:[];
  return {type:'checklist',label,items,...(done.length?{done:done.sort((x,y)=>x-y)}:{})};
 }
 if(b.type==='scale'){
  const [base,min,max,step]=[b.base,b.min,b.max,b.step].map(finite);
  if(base===null||min===null||max===null||step===null||!(step>0)||!(min>0)||min>base||base>max||(max-min)/step>1000)return null;
  const rows=Array.isArray(b.rows)&&b.rows.length&&b.rows.length<=L.scaleRows?b.rows.map(r=>{const name=text(r?.label,L.itemText),amount=finite(r?.amount);return name&&amount!==null&&amount>=0?{label:name,amount,unit:typeof r.unit==='string'?clip(r.unit,20):''}:null;}):[];
  if(!rows.length||rows.includes(null))return null;
  const unit=typeof b.unit==='string'?clip(b.unit,20):'',value=finite(b.value);
  return {type:'scale',label,unit,base,min,max,step,rows,...(value!==null&&value>=min&&value<=max&&value!==base?{value}:{})};
 }
 if(b.type==='choice'){
  const options=Array.isArray(b.options)&&b.options.length>=2&&b.options.length<=L.choiceOptions?readArtifactActions(b.options):[];
  return options.length===b.options?.length?{type:'choice',label,options}:null;
 }
 if(b.type==='parts'){
  const parts=Array.isArray(b.parts)&&b.parts.length>=2&&b.parts.length<=L.parts?b.parts.map(p=>{const name=text(p?.name,L.partName),detail=text(p?.detail,L.partDetail);return name&&detail?{name,detail}:null;}):[];
  return parts.length&&!parts.includes(null)?{type:'parts',label,parts}:null;
 }
 return readShowingBlock(b,label);
}
const list=(value:unknown,min:number,max:number)=>Array.isArray(value)&&value.length>=min&&value.length<=max?value:null;
const tone=(value:unknown):ArtifactTone|null=>ARTIFACT_TONES.includes(value as ArtifactTone)?value as ArtifactTone:null;
const every=<T>(items:(T|null)[]):items is T[]=>items.every(i=>i!==null);
/** The card system's showing blocks (ui/artifacts/CARD-SYSTEM.md): a callout, figures, fact rows, steps, a comparison
 * and tags. Optional text is '' when there is none. */
function readShowingBlock(b:any,label:string):ArtifactBlock|null {
 const L=ARTIFACT_LIMITS,optional=(value:unknown,count:number)=>value===''||value==null?'':text(value,count);
 if(b.type==='callout'){const t=text(b.text,L.calloutText),c=tone(b.tone);return t&&c?{type:'callout',label,text:t,tone:c}:null;}
 if(b.type==='stats'){const items=(list(b.items,2,L.stats)||[]).map(i=>{const value=text(i?.value,L.statValue),name=text(i?.label,L.statLabel),note=optional(i?.note,L.statLabel);return value&&name&&note!==null?{value,label:name,note}:null;});return items.length&&every(items)?{type:'stats',label,items}:null;}
 if(b.type==='facts'){const rows=(list(b.rows,1,L.facts)||[]).map(r=>{const t=text(r?.text,L.itemText);return t&&ARTIFACT_FACT_ICONS.includes(r?.icon)?{icon:r.icon as ArtifactFactIcon,text:t}:null;});return rows.length&&every(rows)?{type:'facts',label,rows}:null;}
 if(b.type==='steps'){const items=(list(b.items,2,L.steps)||[]).map(i=>{const title=text(i?.title,L.stepTitle),detail=optional(i?.detail,L.stepDetail),when=optional(i?.when,L.stepWhen);return title&&detail!==null&&when!==null?{title,detail,when}:null;});return items.length&&every(items)?{type:'steps',label,items}:null;}
 if(b.type==='compare'){
  const options=(list(b.options,2,L.compare)||[]).map(o=>{const name=text(o?.name,L.partName),note=optional(o?.note,L.itemText),points=(list(o?.points,0,L.comparePoints)||[null]).map(p=>text(p,L.comparePoint));return name&&note!==null&&every(points)&&typeof o?.pick==='boolean'?{name,note,points,pick:o.pick}:null;});
  return options.length&&every(options)&&options.filter(o=>o.pick).length<=1?{type:'compare',label,options}:null;
 }
 if(b.type==='tags'){const items=(list(b.items,1,L.tags)||[]).map(i=>text(i,L.tagText));return items.length&&every(items)?{type:'tags',label,items}:null;}
 return null;
}
/** The blocks a card shows, checked; a block the card cannot draw is dropped. */
export function readArtifactBlocks(value:unknown):ArtifactBlock[] {
 return (Array.isArray(value)?value:[]).slice(0,ARTIFACT_LIMITS.blocks).flatMap(b=>{const block=readBlock(b);return block?[block]:[];});
}
/** A scale's amount for the count the person set, rounded the way a cook reads it. */
export function scaledAmount(amount:number,base:number,value:number):number {
 const v=amount*value/base;
 return v>=10?Math.round(v):v>=1?Math.round(v*10)/10:Math.round(v*100)/100;
}
/** A card's picture: a painted scene's ID (the Attention scenes) or none. Which scenes exist is the host's; here only
 * the shape is checked. */
export const validArtifactArt=(value:unknown):value is string=>typeof value==='string'&&/^(none|[a-z][a-z0-9-]{1,40})$/.test(value);
function readOrigin(value:any):ArtifactOrigin|null {
 if(value?.type==='attention'&&typeof value.item==='string'&&value.item)return {type:'attention',item:clip(value.item,160)};
 if(value?.type==='conversation')return {type:'conversation',place:clip(value.place,ARTIFACT_LIMITS.place)};
 return null;
}

/** A stored or reported artifact, checked; null when it is not one. */
export function readArtifact(value:any):Artifact|null {
 if(!value||typeof value!=='object'||!validArtifactId(value.id)||!['attention','answer'].includes(value.kind))return null;
 const title=clip(value.title,ARTIFACT_LIMITS.title),origin=readOrigin(value.origin),createdAt=finite(value.createdAt),updatedAt=finite(value.updatedAt);
 if(!title||!origin||createdAt===null||origin.type!==(value.kind==='attention'?'attention':'conversation'))return null;
 const body=typeof value.body==='string'?value.body.slice(0,ARTIFACT_LIMITS.body):'',chart=readChart(value.chart);
 const artifact:Artifact={id:value.id,kind:value.kind,title,body,chart,size:value.size==='large'||value.size==='small'?value.size:'medium',origin,actions:value.kind==='answer'?readArtifactActions(value.actions):[],createdAt,updatedAt:updatedAt??createdAt};
 const blocks=value.kind==='answer'?readArtifactBlocks(value.blocks):[];
 if(blocks.length)artifact.blocks=blocks;
 if(value.kind==='answer'&&typeof value.brief==='string'&&value.brief.trim())artifact.brief=clip(value.brief,ARTIFACT_LIMITS.brief);
 if(value.kind==='answer'&&typeof value.detail==='string'&&value.detail.trim())artifact.detail=value.detail.slice(0,ARTIFACT_LIMITS.body);
 if(value.kind==='answer'&&tone(value.tone))artifact.tone=value.tone;
 if(value.kind==='answer'&&validArtifactArt(value.art))artifact.art=value.art;
 if(value.kind==='attention'&&typeof value.category==='string')artifact.category=clip(value.category,ARTIFACT_LIMITS.category);
 return artifact;
}

/** Saving an artifact that may already be kept: it keeps its first time and moves to the top. */
export function mergeArtifact(previous:Artifact|undefined,next:Artifact,now:number):Artifact {
 return {...next,createdAt:previous?.createdAt??next.createdAt??now,updatedAt:now};
}

/** Newest first; the IDs past the World's limit are forgotten, oldest first. */
export function orderArtifacts<T extends {id:string;createdAt:number;updatedAt:number}>(list:T[]):{kept:T[];forget:string[]} {
 const sorted=[...list].sort((a,b)=>b.updatedAt-a.updatedAt||b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 return {kept:sorted.slice(0,ARTIFACT_LIMITS.artifacts),forget:sorted.slice(ARTIFACT_LIMITS.artifacts).map(a=>a.id)};
}

/** The Artifacts page groups them by the day they were last shown: Today, Yesterday, then dates. */
export function artifactDays<T extends {id:string;createdAt:number;updatedAt:number}>(list:T[],now:Date=new Date(),locale?:string):{label:string;artifacts:T[]}[] {
 const day=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
 const today=day(now),yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1).getTime(),groups=new Map<string,T[]>();
 for(const artifact of orderArtifacts(list).kept){
  const at=new Date(artifact.updatedAt*1000),start=day(at);
  const label=start===today?'Today':start===yesterday?'Yesterday':at.toLocaleDateString(locale||'en-US',{month:'short',day:'numeric',year:at.getFullYear()===now.getFullYear()?undefined:'numeric'});
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label)!.push(artifact);
 }
 return [...groups].map(([label,artifacts])=>({label,artifacts}));
}

/** The Journal (owner decision 2026-10-07): every artifact together is one journal, one page a day. A card stands on the
 * day it was made, in time order; the day's plan opens the page and its summary closes it, even when the summary was
 * caught up the next morning. Each card keeps one size on the page: an Attention card and a page Fox made are small, a
 * reply draft waiting to be sent (kind `reply`, owner Order 2026-10-07) medium. */
export type JournalEntry<T>={artifact:T;size:ArtifactSize;at:number};
export type JournalPage<T>={day:string;label:string;entries:JournalEntry<T>[]};
const DAILY_TITLE=/^(Plan|Summary) · (.+)$/;
export function journalPages<T extends {id:string;kind:string;title:string;size?:string;createdAt:number;updatedAt:number}>(list:T[],now:Date=new Date(),locale?:string):JournalPage<T>[] {
 const pad=(n:number)=>String(n).padStart(2,'0'),key=(d:Date)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const titleDay=(d:Date)=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
 const pages=new Map<string,JournalEntry<T>[]>(),rank=(a:T)=>{const m=DAILY_TITLE.exec(a.title);return a.kind==='answer'&&m?m[1]==='Plan'?0:2:1;};
 for(const artifact of orderArtifacts(list).kept){
  let at=new Date(artifact.createdAt*1000);
  // The day's plan and summary belong to the day they are about.
  const daily=artifact.kind==='answer'?DAILY_TITLE.exec(artifact.title):null;
  if(daily)for(let back=0;back<3;back++){const d=new Date(at.getFullYear(),at.getMonth(),at.getDate()-back,12);if(titleDay(d)===daily[2]){if(back)at=new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59);break;}}
  // A reply draft from the morning brief is medium: the draft and its Send, Edit and Skip.
  const size:ArtifactSize=artifact.kind==='answer'&&(artifact.size==='large'||artifact.size==='medium'||artifact.size==='small')?artifact.size:artifact.kind==='answer'||artifact.kind==='reply'?'medium':'small';
  const k=key(at);if(!pages.has(k))pages.set(k,[]);pages.get(k)!.push({artifact,size,at:at.getTime()/1000});
 }
 const today=key(now),yesterday=key(new Date(now.getFullYear(),now.getMonth(),now.getDate()-1));
 return [...pages].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,entries])=>{
  const [y,m,d]=day.split('-').map(Number),date=new Date(y,m-1,d);
  const label=day===today?'Today':day===yesterday?'Yesterday':date.toLocaleDateString(locale||'en-US',{weekday:'short',month:'short',day:'numeric',year:y===now.getFullYear()?undefined:'numeric'});
  return {day,label,entries:entries.sort((a,b)=>rank(a.artifact)-rank(b.artifact)||a.at-b.at||a.artifact.id.localeCompare(b.artifact.id))};
 });
}

/** What Fox reads when it looks for an earlier artifact: newest first, matching every word of the query. */
export function findArtifacts(list:Artifact[],query='',limit=12){
 const words=String(query).toLowerCase().split(/\s+/).filter(Boolean);
 return orderArtifacts(list).kept.filter(a=>words.every(w=>(a.title+' '+a.body+' '+(a.category||'')).toLowerCase().includes(w))).slice(0,Math.max(1,Math.min(50,limit)))
  .map(({id,kind,title,category,size,updatedAt,body})=>({id,kind,title,...(category?{category}:{}),size,shownAt:new Date(updatedAt*1000).toISOString(),preview:body.replace(/\s+/g,' ').slice(0,160)}));
}

/** A page Fox made for a moment (core/artifacts) as the Artifacts page lists it: the most interactive artifact, which
 * is already an Applet while its moment lasts or once the person keeps it. Its record stays in the `widgets` table. */
export type MadeArtifact={id:string;kind:'made';title:string;body:string;state:'now'|'kept'|'finished';endsAt:number;createdAt:number;updatedAt:number};
export function madeArtifacts(lists:{now?:unknown[];finished?:unknown[]}):MadeArtifact[] {
 const read=(w:any,finished:boolean):MadeArtifact[]=>{
  const createdAt=finite(w?.createdAt),updatedAt=finite(w?.updatedAt);
  if(typeof w?.id!=='string'||!w.id||typeof w.title!=='string'||createdAt===null)return [];
  return [{id:w.id,kind:'made',title:clip(w.title,ARTIFACT_LIMITS.title),body:clip(w.blurb,200),state:finished?'finished':w.pinned?'kept':'now',endsAt:finite(w.endsAt)??0,createdAt,updatedAt:updatedAt??createdAt}];
 };
 return [...(Array.isArray(lists?.now)?lists.now:[]).flatMap(w=>read(w,false)),...(Array.isArray(lists?.finished)?lists.finished:[]).flatMap(w=>read(w,true))];
}
