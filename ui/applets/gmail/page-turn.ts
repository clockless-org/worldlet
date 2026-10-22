/** A brief turn of live HTML paper; outgoing content is inert and never retains duplicate control IDs. */
export function turnMailPage(body:HTMLElement,previous:HTMLElement|null){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');if(!previous||reduced.matches)return;
 previous.classList.add('mail-page-outgoing');previous.inert=true;previous.setAttribute('aria-hidden','true');
 for(const e of [previous,...previous.querySelectorAll('[id]')])e.removeAttribute('id');
 body.append(previous);body.dataset.turning='true';
 const animation=previous.animate([{transform:'perspective(1000px) rotateY(0deg)',opacity:1},{transform:'perspective(1000px) rotateY(-95deg)',opacity:0}],{duration:420,easing:'cubic-bezier(.4,0,.7,1)'});
 const stop=()=>animation.cancel(),cleanup=()=>{reduced.removeEventListener('change',stop);delete body.dataset.turning;previous.remove();};
 reduced.addEventListener('change',stop,{once:true});
 animation.finished.then(cleanup,cleanup);
}
