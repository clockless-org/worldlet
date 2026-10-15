import {node,actionButton,uiIcon} from '../../components/index.ts';
import {bestScore,gameSymbol,type Game,type GameHost} from '../../games/index.ts';
import type {AppletScene} from '../scene/applet-scene.ts';

/** One live game. A measured heading/control pair can surround its board without replacing its input or state. */
export function createGamePanel({key,title,create}:{key:string;title:string;create:(host:GameHost)=>Game}){
 const element=node('section','game-panel'),header=node('header','game-header'),heading=node('h2','game-title',title),meta=node('p','ui-caption'),metrics=node('div','game-metrics'),body=node('div','game-body'),footer=node('footer','game-footer');
 meta.setAttribute('role','status');header.append(heading,metrics,meta);element.append(header,body,footer);element.dataset.game=key;
 const toolbar=node('div','game-toolbar'),hint=node('span','game-hint ui-caption'),help=node('span','game-help ui-caption');let defaultHint='',notice='';
 const host:GameHost={status:text=>{meta.textContent=text;},best:bestScore(key),metrics:(values,message)=>{notice=message||'';hint.textContent=notice||defaultHint;metrics.replaceChildren();for(const {label,value,icon} of values){const metric=node('div','game-metric');metric.dataset.metric=label.toLowerCase();const name=node('span','game-metric-label',label);if(icon){metric.append(gameSymbol(icon));metric.classList.add('has-icon');}metric.append(name,node('strong','',String(value)));metric.setAttribute('aria-label',label+': '+value);metrics.append(metric);}}};
 const game=create(host),focus=()=>(game.focusTarget||game.element).focus({preventScroll:true});body.append(game.element);defaultHint=game.hint;hint.textContent=notice||defaultHint;if(game.titleIcon)heading.prepend(gameSymbol(game.titleIcon));if(game.settings)header.append(game.settings);help.textContent=game.hint;
 const reset=actionButton({label:game.resetLabel||'New game',run:()=>{game.restart();focus();}});reset.classList.add('game-reset');if(game.controls)reset.prepend(gameSymbol('restart'));
 const directions=node('nav','game-directions');directions.setAttribute('aria-label','Move tiles');
 for(const {direction,run} of game.directions||[]){const b=actionButton({label:'Move '+direction,run:()=>{run();focus();}});b.dataset.direction=direction;b.innerHTML=uiIcon(direction==='right'?'forward':'back');directions.append(b);}
 if(game.directions?.length)footer.append(directions);if(game.controls)footer.append(game.controls);footer.append(hint);if(game.controls)footer.append(help);footer.append(reset);
 let current:AppletScene|null=null,observer:ResizeObserver|null=null;
 function layout(){
  const headingRegion=current?.regions.find(r=>r.id==='heading'),controls=current?.regions.find(r=>r.id==='controls'),toolbarRegion=current?.regions.find(r=>r.id==='toolbar');
  const distributed=!!headingRegion&&!!controls&&!current?.metrics.compact;element.dataset.distributed=String(distributed);
  for(const r of current?.regions||[])r.element.classList.toggle('game-region',distributed&&['heading','toolbar','controls'].includes(r.id));
  header.dataset.toolbar=String(distributed&&!!toolbarRegion);
  if(distributed){headingRegion!.element.append(header);if(toolbarRegion){toolbarRegion.element.append(toolbar);toolbar.append(metrics,reset);}else{header.append(metrics,reset);toolbar.remove();}controls!.element.append(footer);}
  else{element.prepend(header);header.append(metrics);element.append(footer);footer.append(reset);toolbar.remove();}
 }
 function setScene(scene:AppletScene|null){
  if(current===scene)return;observer?.disconnect();current=scene;
  for(const role of ['empty-cell','tile'] as const){const sprite=scene?.sprites?.[role];for(const prop of ['image','size','position'])element.style.removeProperty('--game-'+role+'-'+prop);if(!sprite)continue;
   const [x,y,w,h]=sprite.source;element.style.setProperty('--game-'+role+'-image','url("'+encodeURI(sprite.image)+'")');element.style.setProperty('--game-'+role+'-size',`${100/w}% ${100/h}%`);element.style.setProperty('--game-'+role+'-position',`${w===1?0:100*x/(1-w)}% ${h===1?0:100*y/(1-h)}%`);
  }
  element.dataset.sprites=String(!!scene?.sprites?.['empty-cell']&&!!scene?.sprites?.tile);layout();
  if(scene){observer=new ResizeObserver(layout);observer.observe(scene.element);}
 }
 // The board takes keys only while focused; no document-level game listeners survive navigation.
 queueMicrotask(focus);
 return {element,setScene,dispose(){observer?.disconnect();observer=null;game.dispose?.();header.remove();footer.remove();toolbar.remove();}};
}
