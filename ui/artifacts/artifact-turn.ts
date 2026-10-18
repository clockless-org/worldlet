// A follow-up on an Artifact (context/artifacts/follow-up.ts): the card turns over to its back, then drops down into the
// Doing now side beside Fox, on its right (ui/hud/task-panel.ts), where its work goes on in the background (owner request 2026-10-11).
// The card is put away first; what turns and flies is a sheet standing in its place, as flyIntoJournal does.

/** Where the Doing now side's newest card stands: beside Fox on its right, on the message bar's line. */
function dockSlot(){
 const side=document.querySelector<HTMLElement>('.task-panel:not([hidden]) .task-group[data-group=now]:not([hidden]) .task-card');
 const r=side?.getBoundingClientRect();
 if(r?.width)return {left:r.left,top:r.top,width:r.width,height:r.height};
 return {left:innerWidth/2+170,top:innerHeight-18-40,width:180,height:40};
}

/** Turns `from` over and drops it beside Fox. `putAway` hides the real card the moment the sheet stands in for it. */
export function turnIntoDock(root:HTMLElement,from:HTMLElement|null,putAway:()=>void,{title,status}:{title:string;status:string}):Promise<void>{
 const r=from?.getBoundingClientRect();
 if(!from||from.hidden||!r?.width||matchMedia('(prefers-reduced-motion: reduce)').matches||typeof from.animate!=='function'){putAway();return Promise.resolve();}
 const back=document.createElement('div');back.className='artifact-turned';back.setAttribute('aria-hidden','true');
 back.append(Object.assign(document.createElement('strong'),{textContent:title}),Object.assign(document.createElement('span'),{textContent:status}));
 Object.assign(back.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
 return new Promise(done=>{
  // Its face turns away, then its back turns into view where it stood.
  const away=from.animate([{transform:'perspective(1400px) rotateY(0deg)'},{transform:'perspective(1400px) rotateY(90deg)'}],{duration:260,easing:'cubic-bezier(.5,0,.9,.6)'});
  away.onfinish=away.oncancel=()=>{
   putAway();root.append(back);
   const toward=back.animate([{transform:'perspective(1400px) rotateY(-90deg)'},{transform:'perspective(1400px) rotateY(0deg)'}],{duration:260,easing:'cubic-bezier(.1,.4,.5,1)'});
   toward.onfinish=toward.oncancel=()=>{
    // Then it shrinks down into its place beside Fox.
    const t=dockSlot();
    const drop=back.animate([{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',opacity:1,borderRadius:'14px'},
     {left:t.left+'px',top:t.top+'px',width:t.width+'px',height:t.height+'px',opacity:.15,borderRadius:'16px'}],{duration:560,easing:'cubic-bezier(.55,0,.25,1)',fill:'forwards'});
    drop.onfinish=drop.oncancel=()=>{back.remove();done();};
   };
  };
 });
}
