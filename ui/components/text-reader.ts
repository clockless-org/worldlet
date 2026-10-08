import {node} from './primitives/components.ts';

/** Adapt existing source renderers without copying originals or replacing their handlers.
 * Async originals keep their own DOM/state; added controls inherit shared materials.
 * Browser/media panels and Mail (which composes the same primitives itself) opt out.
 */
export function installTextReaderHUD(host:HTMLElement){
 const templates=new Set(['app-source','coding-session','document','module']);
 function sync(){
  const enabled=templates.has(host.dataset.template)&&!(host.dataset.template==='app-source'&&host.dataset.applet==='gmail');
  if(!enabled){
   host.classList.remove('ui-pane','ui-applet-surface');delete host.dataset.readerHud;
   const body=host.querySelector(':scope > .ui-reader-body');
   if(body)body.replaceWith(...body.childNodes);
   return;
  }
  const header=host.querySelector<HTMLElement>(':scope > .notion-reader-head');
  if(!header)return;
  host.classList.add('ui-pane','ui-applet-surface');host.dataset.readerHud='true';
  header.classList.add('ui-applet-header');header.querySelector('h1')?.classList.add('ui-title');
  header.querySelector('.notion-eyebrow')?.classList.add('ui-caption');
  let body=host.querySelector<HTMLElement>(':scope > .ui-reader-body');
  if(!body){body=node('div','ui-applet-body ui-reader-body');body.tabIndex=0;body.setAttribute('aria-label','Reading content');host.append(body);}
  for(const child of [...host.children])if(child!==header&&child!==body&&!child.classList.contains('world-context'))body.append(child);
  for(const button of body.querySelectorAll('button:not(.notion-page-link):not(.ui-button)'))button.classList.add('ui-button');
  for(const field of body.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea,select'))field.classList.add('ui-input');
 }
 const observer=new MutationObserver(sync);
 observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-template','data-applet']});
 sync();
 return ()=>observer.disconnect();
}
