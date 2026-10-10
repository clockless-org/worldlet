/** The Journal as a book (owner requests 2026-10-08): its own button above Settings opens it over the World, open on a
 * day, in the World's country materials: a timber-leather cover with stitching and brass corners, two ivory leaves with
 * a faint dot grid, a moss ribbon, day tabs on the fore-edge and a pressed sage sprig (journal-book.css). The pages
 * themselves are the Journal (companion-artifacts.ts). It closes with ×, Escape or a click outside, and steps aside
 * when a card in it opens in the World. */
export type JournalBook={open(day?:string):void;close(focus?:boolean):void;toggle():void;readonly isOpen:boolean;readonly element:HTMLDialogElement};
// A pressed sage sprig: one stem, paired leaves along it, one at the tip (drawn here, no image asset).
const LEAF='M0 0C7-8 22-8 30 0C22 8 7 8 0 0Z';
const SPRIG='<svg class="journal-book-sprig" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><path d="M14 112Q52 70 100 22" fill="none" stroke="#6f7f5c" stroke-width="2.2" stroke-linecap="round"/>'
 +[[30,95,-95],[30,95,15],[46,78,-100],[46,78,10],[62,61,-102],[62,61,8],[78,45,-104],[78,45,6]].map(([x,y,r])=>`<path d="${LEAF}" transform="translate(${x} ${y}) rotate(${r})" fill="#93a882" stroke="#6b8160" stroke-width="1"/>`).join('')
 +`<path d="${LEAF}" transform="translate(98 24) rotate(-48) scale(.9)" fill="#a0b48e" stroke="#6b8160" stroke-width="1"/></svg>`;
export function mountJournalBook({root,pages,start,stop,returnFocus}:{root:HTMLElement;pages:HTMLElement;start:(day:string)=>void;stop:()=>void;returnFocus?:()=>HTMLElement|null}):JournalBook{
 const book=document.createElement('dialog');book.id='journalBook';book.className='journal-book';book.setAttribute('aria-label','Journal');
 const close=document.createElement('button');close.type='button';close.className='journal-book-close';close.textContent='×';close.setAttribute('aria-label','Close journal');
 const ribbon=document.createElement('span');ribbon.className='journal-book-ribbon';ribbon.setAttribute('aria-hidden','true');
 const sprig=document.createElement('span');sprig.className='journal-book-sprig-holder';sprig.innerHTML=SPRIG;
 book.append(ribbon,pages,sprig,close);root.append(book);
 function open(day=''){
  if(root.dataset.onboardingLocked==='true')return;
  start(day);
  if(book.open)return;
  book.show();root.classList.add('journal-book-open');root.dispatchEvent(new Event('worldlet:journal-opened'));
  close.focus({preventScroll:true});
 }
 function shut(focus=false){
  if(!book.open)return;
  stop();book.close();root.classList.remove('journal-book-open');root.dispatchEvent(new Event('worldlet:journal-closed'));
  if(focus)returnFocus?.()?.focus({preventScroll:true});
 }
 close.onclick=()=>shut(true);
 book.addEventListener('cancel',e=>{e.preventDefault();shut(true);});
 window.addEventListener('keydown',e=>{if(book.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();shut(true);}},true);
 // A click outside closes it, except on Fox and the button that opened it (which toggles it itself).
 root.addEventListener('pointerdown',e=>{const t=e.target as Element;if(book.open&&!book.contains(t)&&!t.closest('.world-today-open,.companion-avatar,.companion-text-entry'))shut();},true);
 return {open,close:shut,toggle(){if(book.open)shut(true);else open();},get isOpen(){return book.open;},element:book};
}
/** A card the person closes goes into the Journal (owner request 2026-10-08): a sheet of paper with its title leaves the
 * card's place and shrinks into the Journal, today's date in the World's top-left corner, which takes it with a small bounce. Nothing moves when the button
 * is not on screen (inside an Applet, on the desktop) or motion is reduced, beyond that bounce. */
export function flyIntoJournal(root:HTMLElement,from:HTMLElement|null){
 const target=document.querySelector<HTMLElement>('.world-today-open'),r=from?.getBoundingClientRect(),t=target?.getBoundingClientRect();
 if(!from||!target||!r?.width||!t?.width||from.hidden)return;
 const receive=()=>{target.classList.remove('is-receiving');void target.offsetWidth;target.classList.add('is-receiving');setTimeout(()=>target.classList.remove('is-receiving'),700);};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof (from as any).animate!=='function'){receive();return;}
 const sheet=document.createElement('div');sheet.className='journal-fly';sheet.setAttribute('aria-hidden','true');
 const title=from.querySelector('h2')?.textContent?.trim();if(title)sheet.append(Object.assign(document.createElement('strong'),{textContent:title}));
 Object.assign(sheet.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
 root.append(sheet);
 const dx=t.left+t.width/2-(r.left+r.width/2),dy=t.top+t.height/2-(r.top+r.height/2),scale=Math.max(.04,Math.min(t.width,t.height)/Math.max(r.width,r.height));
 const flight=sheet.animate([{transform:'none',opacity:1},{transform:`translate(${dx*.35}px,${dy*.2-40}px) scale(${Math.max(scale,.45)}) rotate(-4deg)`,opacity:.95,offset:.4},{transform:`translate(${dx}px,${dy}px) scale(${scale}) rotate(-8deg)`,opacity:.2}],{duration:620,easing:'cubic-bezier(.45,0,.7,1)'});
 flight.onfinish=flight.oncancel=()=>{sheet.remove();receive();};
}
