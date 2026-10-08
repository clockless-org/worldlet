import {ARTIFACT_TONES,artifactInputProblem,artifactSizeFor,readArtifactActions,readArtifactBlocks,type ArtifactSize,type ArtifactBlock} from '../../core/artifacts/index.ts';
import {renderArtifactBlocks,artifactPicture} from './artifact-blocks.ts';
// An artifact is one card with a size (core/artifacts/README.md): small and medium sit above Fox in the middle; large takes the
// main stage while Fox and the conversation stand in the right-hand column (owner decision 2026-10-06). It never pages:
// a body that fits shows whole, and a longer one scrolls inside the card (owner Order 2026-10-07).
const ARROWS=(grow:boolean)=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${grow?'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7':'M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7'}"/></svg>`;
export function mountFoxArtifact(root,renderMarkdown,onClose,onLink,onResize:(size:string)=>void=()=>{},onAction:(action:{label:string;request:string})=>void=()=>{},onBlocks:(blocks:ArtifactBlock[])=>void=()=>{}){
 const panel=document.createElement('section');panel.id='foxArtifact';panel.className='attention-preview fox-artifact';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','foxArtifactTitle');
 const title=document.createElement('h2');title.id='foxArtifactTitle';
 const close=document.createElement('button');close.className='attention-preview-control';close.textContent='×';close.setAttribute('aria-label','Close artifact');close.onclick=onClose;
 const category=document.createElement('span');category.className='attention-preview-category fox-artifact-origin';category.textContent='From this conversation';
 const resize=document.createElement('button');resize.type='button';resize.className='attention-preview-control fox-artifact-size';
 // The control grows a card a step at a time (small, medium, large); a large one shrinks back to medium.
 resize.onclick=()=>{setSize(panel.dataset.size==='large'?'medium':panel.dataset.size==='small'?'medium':'large');onResize(panel.dataset.size);};
 const body=document.createElement('div');body.className='fox-artifact-body';
body.tabIndex=0;body.setAttribute('aria-label','Artifact contents');
 // Next steps Fox offered: a click asks Fox in the person's name (core/artifacts/README.md#actions).
 const actions=document.createElement('div');actions.className='attention-preview-actions fox-artifact-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Next steps');actions.hidden=true;
 // The card system (ui/attention/CARD-SYSTEM.md): an answer has the Attention card's painted picture, here a band across
 // its head behind the paper scrim, and a tone that colours its labels, rules and buttons.
 const art=document.createElement('img');art.className='attention-preview-art fox-artifact-art';art.alt='';art.setAttribute('aria-hidden','true');
 const scrim=document.createElement('div');scrim.className='attention-preview-scrim fox-artifact-scrim';scrim.setAttribute('aria-hidden','true');
 art.onerror=()=>{art.hidden=scrim.hidden=true;delete panel.dataset.art;};
 panel.append(art,scrim,close,resize,category,title,body,actions);root.append(panel);
 function setSize(size:ArtifactSize){
  panel.dataset.size=size;root.dataset.artifactSize=size;
  const grow=size!=='large';resize.innerHTML=ARROWS(grow);resize.setAttribute('aria-label',grow?'Make artifact larger':'Make artifact smaller');resize.title=grow?'Larger':'Smaller';
 }
 let source='',chart=null,blocks:ArtifactBlock[]=[];
 // The card's body as it shows it: Markdown and the chart Fox verified, drawn locally.
 function render(){
  const content=renderMarkdown(source,{title:title.textContent,path:'artifact.md'});
  // No remote image fetching from generated content. Numeric charts are rendered locally.
  for(const image of content.querySelectorAll('img'))image.remove();
  if(chart){const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=chart.title;figure.append(caption);const max=Math.max(1,...chart.values.map(v=>v.value));for(const v of chart.values){const row=document.createElement('div');row.className='fox-artifact-bar';const label=document.createElement('span'),bar=document.createElement('i'),value=document.createElement('span');label.textContent=v.label;bar.style.width=(v.value/max*100)+'%';value.textContent=v.value+' '+chart.unit;row.append(label,bar,value);figure.append(row);}content.prepend(figure);}
  // Blocks the person works with on the card: ticks and counts are kept with the artifact; a choice drafts their answer.
  if(blocks.length)content.append(renderArtifactBlocks(blocks,{live:true,onRequest:onAction,onChange:next=>{blocks=next;onBlocks(next);}}));
  return content;
 }
 // The card grows with its content up to its cap (a large one to the height it has beside Fox); past that the body scrolls.
 function markScroll(){body.dataset.scrollable=String(body.scrollHeight>body.clientHeight+2);body.dataset.more=String(body.scrollHeight-body.clientHeight-body.scrollTop>2);}
 function layout(){if(panel.hidden)return;body.replaceChildren(render());body.scrollTop=0;markScroll();}
 body.addEventListener('scroll',markScroll,{passive:true});
 panel.addEventListener('click',e=>{const a=(e.target as Element).closest('a');if(a){e.preventDefault();const href=a.getAttribute('href');if(/^https:\/\//.test(href||''))onLink(href);}});
 panel.addEventListener('pointerdown',e=>{(e as any).worldletKeepFox=true;});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden&&!e.defaultPrevented){e.preventDefault();onClose();}});
 // The card's own size changes when Fox moves aside to the right-hand column.
 new ResizeObserver(()=>{if(!panel.hidden)markScroll();}).observe(panel);
 return {show(args){
  const problem=artifactInputProblem(args);if(problem)return {error:problem};const c=args.chart;
  source=args.body;chart=c;blocks=readArtifactBlocks(args.blocks);panel.dataset.tone=ARTIFACT_TONES.includes(args.tone)?args.tone:'moss';{const picture=artifactPicture({title:args.title,body:args.body,art:args.art,tone:args.tone});art.hidden=scrim.hidden=!picture;if(picture){art.src=picture;panel.dataset.art='illustration';}else{art.removeAttribute('src');delete panel.dataset.art;}}title.textContent=args.title;panel.dataset.sourceId='artifact:'+(typeof args.id==='string'?args.id:crypto.randomUUID());category.textContent=typeof args.label==='string'&&args.label?args.label:'From this conversation';setSize(artifactSizeFor(args.size,args.body,c,blocks));
  actions.replaceChildren(...readArtifactActions(args.actions).map((action,i)=>{const b=document.createElement('button');b.type='button';b.className='attention-preview-action'+(i===0?' attention-preview-action-primary':'');b.textContent=action.label;b.onclick=()=>onAction(action);return b;}));
  actions.hidden=!actions.childElementCount;
  panel.hidden=false;layout();return {ok:true,id:panel.dataset.sourceId,title:args.title,size:panel.dataset.size,scrolls:body.dataset.scrollable==='true'};
 },close(){panel.hidden=true;if(root.dataset.artifactSize)delete root.dataset.artifactSize;},get visible(){return !panel.hidden;}};
}
