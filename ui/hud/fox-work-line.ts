// What Fox is doing right now, in the World's top-right (owner decisions 2026-10-08 and 2026-10-09: the left side is
// what the person reads, the Journal corner and the Attention Center; the top-right says what Fox and background work
// are doing). One quiet line in the corner's own ink: while work runs, its step ("Making your morning brief…",
// "Drafting a reply: …"), the newest first; when it ends with something made, what was done ("2 replies ready ·
// Journal") for a few seconds, which opens the Journal on today's page, then it fades. It hears the same
// `worldlet:fox-status` events as Fox's name tag (`{source, text}` while working, `{source, text: '', done}` at the
// end). No setting turns it off; it is hidden during onboarding and the first-run tour (ui/components/layout.css).
import {FOX_STATUS_EVENT} from '../companion/index.ts';
import {uiIcon} from '../components/index.ts';
import {FOX_WORK_DONE_SECONDS} from '../../core/artifacts/index.ts';

export function mountFoxWorkLine(root:HTMLElement){
 const line=document.createElement('div');line.className='fox-work';line.hidden=true;
 line.setAttribute('role','status');line.setAttribute('aria-live','polite');
 const working=document.createElement('span');working.className='fox-work-now';
 const dot=document.createElement('span');dot.className='fox-work-dot';dot.setAttribute('aria-hidden','true');
 const text=document.createElement('span');text.className='fox-work-text';
 working.append(dot,text);
 const done=document.createElement('button');done.type='button';done.className='fox-work-done';done.hidden=true;
 const doneText=document.createElement('span'),doneLink=document.createElement('span');doneLink.className='fox-work-link';doneLink.textContent='Journal';
 done.innerHTML=uiIcon('book');done.append(doneText,document.createTextNode(' · '),doneLink);
 done.addEventListener('pointerdown',e=>{e.stopPropagation();(e as any).worldletKeepFox=true;});
 line.append(working,done);
 const corner=root.querySelector('.notion-top .world-environment')||root.querySelector('.notion-top')||root;corner.append(line);
 const running=new Map<string,string>();let finished='',fade=0,hide=0;
 const today=()=>{const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');};
 done.onclick=e=>{e.stopPropagation();if(root.dataset.tourLock==='true')return;clear();window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:today()}}));};
 function clear(){finished='';render();}
 function render(){
  clearTimeout(fade);clearTimeout(hide);
  const now=[...running.values()].at(-1)||'';
  working.hidden=!now;text.textContent=now;
  done.hidden=!!now||!finished;doneText.textContent=finished;done.setAttribute('aria-label',finished?finished+': open the Journal':'');
  const show=!!now||!!finished;line.dataset.state=now?'working':finished?'done':'idle';
  if(show){line.hidden=false;requestAnimationFrame(()=>line.classList.add('is-shown'));}
  else{line.classList.remove('is-shown');hide=window.setTimeout(()=>{if(line.dataset.state==='idle')line.hidden=true;},400);}
  if(!now&&finished)fade=window.setTimeout(clear,FOX_WORK_DONE_SECONDS*1000);
 }
 window.addEventListener(FOX_STATUS_EVENT,(e:any)=>{
  const source=String(e.detail?.source||'work'),said=String(e.detail?.text||'').trim().slice(0,80),made=String(e.detail?.done||'').trim().slice(0,60);
  running.delete(source);if(said){running.set(source,said);finished='';}else if(made)finished=made;
  render();
 });
 return line;
}
