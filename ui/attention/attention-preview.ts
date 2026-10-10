import {attentionSources} from './source-links.ts';
import {attentionIcon} from './icon.ts';
import DOMPurify from 'dompurify';
import {attentionPictureFits,attentionPreviewData,attentionSourceImage,safeAttentionURL} from '../../core/attention/index.ts';
import {attentionSceneArt} from './scene-art.ts';
import {attentionTimeRows,attentionGroupWhen,attentionTimeline} from './time.ts';
import {modelMarkdown,uiIcon} from '../components/index.ts';
import {ACTIVE_THEME,attentionPicture} from '../themes/index.ts';
const make=(tag:string,cls:string,text?:string)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;};
type ImageLookup=(url:string)=>Promise<{image?:string}|null>;
let imageLookup:ImageLookup|null=null;
/** The host's reader of an email's own picture (a data: URL); none in the practice world or the website. */
export function setAttentionImageLookup(lookup:ImageLookup|null){imageLookup=lookup;}
export function mountAttentionPreview({root,onClose,onOriginal,onLink}){
 const panel=make('section','attention-preview');panel.id='attentionPreview';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','attentionPreviewTitle');panel.tabIndex=-1;
 let selected:any=null,returnFocus:HTMLElement=null,returnItem:string=null;
 const control=(label:string,run:()=>void,icon?:string)=>{const b=make('button','attention-preview-control',icon?'':label) as HTMLButtonElement;b.type='button';b.setAttribute('aria-label',label);b.title=label;if(icon)b.innerHTML=uiIcon(icon);b.onclick=run;return b;};
 const tools=make('div','attention-preview-tools');
 const close=control('Close preview',()=>onClose());close.textContent='×';tools.append(close);
 const hero=make('div','attention-preview-hero'),category=make('span','attention-preview-category');
 const title=make('h2','attention-preview-title');title.id='attentionPreviewTitle';
 // The card's picture is its background, strongest on the right, with a paper scrim keeping every word readable
 // (owner Order 2026-10-08). An email's own picture takes the illustration's place when it is a real picture.
 const art=make('img','attention-preview-art') as HTMLImageElement;art.alt='';art.setAttribute('aria-hidden','true');
 const scrim=make('div','attention-preview-scrim');scrim.setAttribute('aria-hidden','true');
 let artRequest=0;
 const refreshArt=()=>{
  if(!selected)return;
  const data=attentionPreviewData(selected),request=++artRequest;
  const illustrate=()=>{
   if(request!==artRequest)return;
   panel.dataset.art='illustration';
   art.onload=null;art.onerror=()=>{art.onerror=null;art.src=attentionPicture(data.image,ACTIVE_THEME.pack.id);};
   art.src=attentionPicture(attentionSceneArt(data),ACTIVE_THEME.pack.id,data.image);
  };
  illustrate();
  const url=attentionSourceImage(selected.worldItemSources);
  if(!url||!imageLookup)return;
  imageLookup(url).then(value=>{
   const image=value?.image;
   if(request!==artRequest||typeof image!=='string'||!image.startsWith('data:image/'))return;
   // Measure it first: a small or oddly shaped picture keeps the illustration.
   const probe=new Image();probe.onload=()=>{
    if(request!==artRequest||!attentionPictureFits(probe.naturalWidth,probe.naturalHeight))return;
    panel.dataset.art='source';art.onerror=illustrate;art.src=image;
   };probe.src=image;
  }).catch(()=>{});
 };
 const heading=make('div','attention-preview-heading');heading.append(category,title);hero.append(heading);
 const when=make('div','attention-preview-when'),date=make('span','attention-preview-date'),clock=make('span','attention-preview-clock'),age=make('span','attention-preview-age');const timeIcon=make('span','attention-preview-location-icon');timeIcon.innerHTML=uiIcon('clock');when.append(timeIcon,date,clock,age);
 const summary=make('div','attention-preview-summary'),venue=make('div','attention-preview-venue');
 const sourceIcons=make('div','attention-preview-sources');
 const facts=make('div','attention-preview-facts');
 facts.append(when,venue);heading.append(facts);
 // Settlement belongs on the item itself: one clear primary outcome, then quieter choices.
 const actions=make('div','attention-preview-actions');actions.setAttribute('role','group');actions.setAttribute('aria-label','Item actions');
 const footer=make('footer','attention-preview-footer'),provenance=make('span','attention-preview-provenance');const sourceGroup=make('div','attention-preview-source-group');sourceGroup.append(provenance,sourceIcons);footer.append(sourceGroup,actions);
 const syncFooter=()=>{footer.hidden=!sourceIcons.childElementCount&&!actions.childElementCount;};
 // Changed evidence for this task waits here as one quiet line of text-link choices (ui/attention/task-review.ts).
 const review=make('p','attention-preview-review');review.hidden=true;review.setAttribute('role','group');
 // A reply Fox prepared for this item waits in the Journal (owner decision 2026-10-09): one quiet line that opens it.
 const drafted=make('p','attention-preview-review attention-preview-drafted');drafted.hidden=true;
 panel.append(art,scrim,tools,hero,summary,review,drafted,footer);root.append(panel);
 panel.addEventListener('keydown',e=>{if(!panel.hidden&&e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden&&!e.defaultPrevented){e.preventDefault();onClose();}});
 panel.addEventListener('pointerdown',e=>{(e as any).worldletKeepFox=true;});
 return {
  element:panel,
  open(page){
   if(panel.hidden){returnFocus=document.activeElement as HTMLElement;returnItem=returnFocus?.closest('[data-world-item-id]')?.getAttribute('data-world-item-id');}
   selected=page;const data=attentionPreviewData(page),signal=page.worldItemSignal||{};
   panel.dataset.sourceId='attention:'+page.worldItemId;panel.dataset.kind=data.kind;root.dataset.attentionPreview='true';root.dataset.attentionKind=data.kind;
   review.hidden=true;review.replaceChildren();drafted.hidden=true;drafted.replaceChildren();
   const sources=attentionSources(page);provenance.textContent=sources.length===1?'Source':sources.length+' sources';provenance.hidden=!sources.length;sourceIcons.replaceChildren();actions.replaceChildren();
   sources.forEach((source,index)=>{const label='Open '+source.label+(sources.filter(s=>s.label===source.label).length>1?' · '+(index+1):'');const button=control(label,()=>onOriginal(page,source.ref),source.icon);button.classList.add('attention-preview-original');sourceIcons.append(button);});
   // The "Source" word opens it too (owner feedback 2026-10-02: clicking Source did nothing); with several, the icons choose.
   provenance.onclick=sources.length===1?()=>onOriginal(page,sources[0].ref):null;provenance.classList.toggle('is-link',sources.length===1);
   category.replaceChildren();const kindMark=make('span','attention-preview-kind');kindMark.innerHTML=attentionIcon({event:'event',task:'needsAction',update:'unseen'}[data.kind]);category.append(kindMark,document.createTextNode(data.category));
   title.textContent=data.title;title.title=page.title;
   refreshArt();summary.replaceChildren();summary.hidden=!data.summary;
   summary.append(DOMPurify.sanitize(modelMarkdown.parse(data.summary,{async:false}),{
    ALLOWED_TAGS:['p','h2','h3','h4','ul','ol','li','strong','em','code','a','blockquote','br'],
    ALLOWED_ATTR:['href'],RETURN_DOM_FRAGMENT:true,
   }));
   for(const link of summary.querySelectorAll('a')){
    const href=link.getAttribute('href');
    if(!safeAttentionURL(href)){link.replaceWith(document.createTextNode(link.textContent));continue;}
    link.addEventListener('click',e=>{e.preventDefault();onLink(href);});
   }
   const members=page.attentionTimeMembers||[signal],timing=attentionGroupWhen(members);
   when.hidden=!timing;when.title=timing?.label||'';
   when.dataset.deadline=String(!!timing?.deadline);
   date.textContent=timing?.absolute||'';clock.textContent='';age.textContent='';
   if(members.length===1){
    const rows=attentionTimeRows(signal),line=attentionTimeline(signal);
    date.textContent=rows[0]?.date||'';clock.textContent=rows[0]?.clock||'';
    // How far away it is, and when the mail came: "In 2 days · Received 3 days ago" (owner decision 2026-10-04).
    const relative=[rows[0]?.ago,line?.received].filter(Boolean).join(' · ');
    age.textContent=relative.charAt(0).toUpperCase()+relative.slice(1);
    when.dataset.overdue=String(!!rows[0]?.overdue);
    when.title=rows.map(row=>row.label).join('\n');
   }
   when.tabIndex=timing?0:-1;when.setAttribute('aria-label',when.title);
   venue.replaceChildren();venue.hidden=!data.location;
   if(data.location){const label=make(data.locationURL?'a':'span','attention-preview-location',data.location);if(data.locationURL){(label as HTMLAnchorElement).href=data.locationURL;label.addEventListener('click',e=>{e.preventDefault();onLink(data.locationURL);});}const mark=make('span','attention-preview-location-icon');mark.innerHTML=uiIcon(data.physical?'map':'link');venue.append(mark,label);}
   syncFooter();panel.hidden=false;panel.focus({preventScroll:true});
  },
  /** Host-owned outcomes for the open item; the card only renders them. */
  setActions(list:{key:string;label:string;primary?:boolean;run:()=>void}[]){
   actions.replaceChildren(...list.map(action=>{const b=make('button','attention-preview-action'+(action.primary?' attention-preview-action-primary':''),action.label) as HTMLButtonElement;b.type='button';b.dataset.actionId=action.key;b.onclick=()=>action.run();return b;}));
   syncFooter();
  },
  /** A pending review of this task, or null; a choice disables the line until the host answers. */
  setReview(value:{text:string;choices:{key:string;label:string;run:()=>Promise<unknown>}[]}|null){
   review.replaceChildren();review.hidden=!value;if(!value)return;
   const buttons=value.choices.map(choice=>{const b=make('button','attention-preview-review-choice',choice.label) as HTMLButtonElement;b.type='button';b.dataset.reviewChoice=choice.key;
    b.onclick=async()=>{buttons.forEach(x=>x.disabled=true);try{await choice.run();}finally{buttons.forEach(x=>x.disabled=false);}};return b;});
   review.setAttribute('aria-label',value.text);review.append(make('span','attention-preview-review-text',value.text),...buttons);
  },
  /** A reply Fox prepared for this item, waiting in the Journal, or null. */
  setDraft(value:{text:string;label:string;run:()=>void}|null){
   drafted.replaceChildren();drafted.hidden=!value;if(!value)return;
   const b=make('button','attention-preview-review-choice',value.label) as HTMLButtonElement;b.type='button';b.dataset.draftChoice='review';b.onclick=()=>value.run();
   drafted.append(make('span','attention-preview-review-text',value.text),b);
  },
  close({restoreFocus=true}={}){selected=null;artRequest++;panel.hidden=true;delete root.dataset.attentionPreview;delete root.dataset.attentionKind;if(restoreFocus){const target=returnFocus?.isConnected?returnFocus:returnItem?root.querySelector('[data-world-item-id="'+CSS.escape(returnItem)+'"]'):null;(target as HTMLElement)?.focus({preventScroll:true});}},
 };
}
