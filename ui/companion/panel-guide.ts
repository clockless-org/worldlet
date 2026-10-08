import {replyMarkdown} from './reply-markdown.ts';

/** A Fox guide ({text, body, actions}) drawn inside the companion panel instead of Fox's bubble, so
 * a setting or an energy step finishes on the page where it started. `view` stands in for the
 * World view the guides normally speak through. */
export function createPanelGuide({onClear=()=>{}}:{onClear?:()=>void}={}){
 const element=document.createElement('div');element.className='companion-panel-guide';element.hidden=true;
 const view={
  setGuide(guide:{text?:string;body?:HTMLElement|null;actions?:HTMLElement[]}|null){
   if(!guide){element.hidden=true;element.replaceChildren();onClear();return;}
   const text=document.createElement('div');text.className='companion-panel-guide-text';
   if(guide.text)text.append(replyMarkdown(guide.text));
   const parts:HTMLElement[]=[text];if(guide.body)parts.push(guide.body);
   if(guide.actions?.length){
    const row=document.createElement('div');row.className='companion-panel-guide-actions';
    for(const b of guide.actions){b.classList.add('companion-info-action');row.append(b);}
    parts.push(row);
   }
   element.replaceChildren(...parts);element.hidden=false;
  },
  revealGuide(){},
  // "Keep chatting" and similar endings close the step; the panel stays where it is.
  openText(){view.setGuide(null);},
  ask(){view.setGuide(null);}
 };
 return {element,view};
}
