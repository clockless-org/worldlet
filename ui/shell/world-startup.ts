import {dissolveWorldSurface,WORLD_REVEAL_MS} from './world-reveal.ts';
import {startupWalk} from './startup-walk.ts';
// Tiny boot script: paint an accessible loader before evaluating the world bundle.
const loader=document.getElementById('worldStartup'),retry=document.getElementById('worldStartupRetry');
startupWalk(loader);
const timings: Record<string,number>=window.worldletStartupTimings={boot:performance.now()};
const phaseLabel=document.getElementById('worldStartupPhase');
function phase(value,text){loader.dataset.phase=value;phaseLabel.textContent=text;}
let finished=false,failed=false;
retry.onclick=()=>location.reload();
function fail(){if(finished)return;failed=true;loader.dataset.failed='true';loader.setAttribute('aria-busy','false');phaseLabel.textContent='Your world could not open. Try again.';retry.hidden=false;clearTimeout(slow);}
const slow=setTimeout(()=>{if(!finished&&!failed){loader.dataset.delayed='true';phaseLabel.textContent='Your world is taking a little longer…';retry.hidden=false;}},15000);
document.addEventListener('worldlet:setup-start',()=>{clearTimeout(slow);retry.hidden=true;phase('setup','Make this world yours');});
document.addEventListener('worldlet:setup-complete',()=>{loader.setAttribute('aria-busy','true');phase('scene','Bringing your world to life');});
document.addEventListener('worldlet:startup-phase',(event: any)=>{if(finished||failed)return;timings[event.detail]=performance.now();if(event.detail==='scene')phase('scene','Bringing your world to life');});
document.addEventListener('worldlet:world-error',fail);
// Chromium reports a ResizeObserver loop as an error event though nothing failed; it is no reason to give up the world.
window.addEventListener('error',event=>{if(!/^ResizeObserver loop/.test(event.message||''))fail();});
document.addEventListener('worldlet:world-ready',()=>{
 if(finished||failed)return;finished=true;clearTimeout(slow);timings.firstFrame=performance.now();
 phase('ready','Ready to explore');
 // Leave two presentation opportunities after the world submits its first draw.
 let revealed=false;let revealTimer;
 const reveal=()=>{if(revealed)return;revealed=true;clearTimeout(revealTimer);timings.revealed=performance.now();loader.setAttribute('aria-busy','false');const opening=document.documentElement.dataset.firstVisit==='true'||loader.classList.contains('setup-entering');if(opening)dissolveWorldSurface(loader);loader.classList.add(opening?'is-opening':'is-ready');if(opening)document.getElementById('notionStage')?.classList.add('world-arriving');document.dispatchEvent(new Event('worldlet:world-opening'));setTimeout(()=>{loader.remove();document.getElementById('notionStage')?.classList.remove('world-arriving');document.dispatchEvent(new Event('worldlet:world-revealed'));},matchMedia('(prefers-reduced-motion: reduce)').matches?0:opening?WORLD_REVEAL_MS:loader.classList.contains('setup-entering')?700:300);};
 revealTimer=setTimeout(reveal,250);
 requestAnimationFrame(()=>requestAnimationFrame(reveal));
},{once:true});
let bundleStarted=false;
function startBundle(){
 if(bundleStarted)return;bundleStarted=true;clearTimeout(bootFallback);
 timings.bundleStart=performance.now();const script=document.createElement('script');script.src='worldlet.js?v='+encodeURIComponent(document.documentElement.dataset.bundleVersion||'');script.onerror=fail;document.body.append(script);
}
// Background WKWebViews can suspend animation frames. Boot must still make
// progress; late frames must not initialize the world twice.
const bootFallback=setTimeout(startBundle,250);
requestAnimationFrame(()=>requestAnimationFrame(startBundle));
