import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {AUTHORED_STUDY_STATES} from '../ui/companion/animation/fox-authored-study.ts';
const dir='resources/styles/builtin/drafts/fox-states-v1',painted='resources/styles/builtin/assets/companion/painted';
const files={idle:'resources/styles/builtin/assets/companion/rig/fallback.png',// Greeting is layered (body + arm), so it has no single study plate.
...Object.fromEntries(AUTHORED_STUDY_STATES.filter(id=>id!=='greeting').map(id=>[id,dir+'/'+id+'.png'])),greetingBody:dir+'/greeting-body.png',greetingArm:dir+'/greeting-arm.png',half:painted+'/half-eye.png',closed:painted+'/closed-eye.png'};
const sources=Object.fromEntries(await Promise.all(Object.entries(files).map(async([id,file])=>[id,'data:image/png;base64,'+(await readFile(file)).toString('base64')])));
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
import {FOX_STATES} from './ui/companion/animation/fox-state-catalog.ts';
import {createPaintedIdle} from './ui/companion/animation/fox-painted-idle.ts';
import {authoredStudyPose,authoredStudyVertex} from './ui/companion/animation/fox-authored-study.ts';
import {createGreetingStudy} from './ui/companion/animation/fox-greeting-study.ts';
const sources=globalThis.sources,stage=document.querySelector('#stage'),catalog=document.querySelector('#catalog'),title=document.querySelector('#stateTitle'),description=document.querySelector('#description'),status=document.querySelector('#status'),play=document.querySelector('#play'),slider=document.querySelector('#time');
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),renderers=new Map();
let active='idle',time=0,paused=false,last=performance.now(),generation=0;
function draw(){const current=renderers.get(active);if(!current)return;current.rig.draw(time,reduced.matches,active==='idle'?undefined:authoredStudyPose(active,time,reduced.matches));slider.value=String(time/1000);document.querySelector('output').textContent=(time/1000).toFixed(2)+' s';}
async function select(id){const token=++generation;active=id;time=0;const spec=FOX_STATES.find(s=>s.id===id);title.textContent=spec.label;description.textContent=spec.performance;
 document.querySelectorAll('[data-state]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.state===id)));
 stage.querySelectorAll('canvas').forEach(canvas=>canvas.hidden=true);
 if(!sources[id==='greeting'?'greetingBody':id]){status.textContent='Artwork needed — not implemented. No placeholder animation.';stage.dataset.empty='true';return;}
 status.textContent=id==='idle'?'Live baseline':'Key-pose motion study — transitions and visual acceptance pending';stage.dataset.empty='false';
 if(!renderers.has(id)){const canvas=document.createElement('canvas');canvas.width=canvas.height=640;canvas.hidden=true;canvas.setAttribute('aria-label',spec.label+' animation');stage.append(canvas);const rig=id==='greeting'?await createGreetingStudy(canvas,{body:sources.greetingBody,arm:sources.greetingArm,half:sources.half,closed:sources.closed}):await createPaintedIdle(canvas,[sources[id],sources.half,sources.closed],id==='idle'?undefined:(u,v,p)=>authoredStudyVertex(id,u,v,p));renderers.set(id,{canvas,rig});}
 if(token!==generation)return;
 renderers.get(id).canvas.hidden=false;draw();document.body.dataset.ready=id;
}
for(const spec of FOX_STATES){const button=document.createElement('button');button.dataset.state=spec.id;button.setAttribute('aria-pressed','false');button.textContent=spec.label;const small=document.createElement('small');small.textContent=spec.art==='existing'?'Baseline':spec.art==='key-pose'?'Motion study':'Artwork needed';button.append(small);button.onclick=()=>select(spec.id).catch(e=>{status.textContent=e.message});catalog.append(button);}
play.onclick=()=>{paused=!paused;play.textContent=paused?'Play':'Pause'};
slider.oninput=()=>{paused=true;play.textContent='Play';time=Number(slider.value)*1000;draw()};
document.querySelector('#small').onchange=e=>stage.classList.toggle('hud-size',e.target.checked);
document.querySelector('#background').onchange=e=>stage.dataset.background=e.target.value;
reduced.addEventListener('change',draw);
globalThis.foxStateStudio={select,draw(ms,override){paused=true;time=ms;if(override){renderers.get(active)?.rig.draw(ms,reduced.matches,override)}else draw()},get active(){return active}};
await select('idle');
function tick(now){if(!paused&&!document.hidden){time=(time+Math.min(80,now-last))%12000;draw()}last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{renderers.forEach(r=>r.rig.dispose());renderers.clear()},{once:true});
`},bundle:true,write:false,format:'esm'});
await mkdir('output/companion',{recursive:true});
await writeFile('output/companion/state-studio.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fox · State studio</title><style>
*{box-sizing:border-box}body{margin:0;background:#eeede5;color:#354a40;font:15px system-ui}main{max-width:1180px;margin:auto;padding:24px}h1{font-size:25px}h2{font-size:20px}p{line-height:1.5}header p,#status{color:#68756a}section{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1fr);gap:24px}.viewer{min-width:0}#stage{height:460px;display:grid;place-items:center;border-radius:28px;background:#e4e3d8}#stage[data-background=dark]{background:#263931}#stage canvas{width:min(100%,440px);height:auto}#stage canvas[hidden]{display:none}#stage.hud-size canvas{width:144px}#stage[data-empty=true]:after{content:'No authored animation yet';color:#758172}#catalog{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-content:start}button,select{border:1px solid #9ea99555;background:#ffffff60;border-radius:14px;padding:10px;color:inherit;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#d9e1d0;border-color:#74917a}button small{display:block;font-size:10px;color:#74816d;margin-top:4px}label{display:inline-flex;align-items:center;gap:5px;margin:8px 10px 8px 0}#description{min-height:48px}#time{width:min(300px,65%)}output{font-variant-numeric:tabular-nums}#status{font-size:12px;min-height:30px}@media(max-width:720px){main{padding:16px}section{grid-template-columns:1fr}#stage{height:360px}#stage canvas{max-height:350px;width:auto;max-width:100%}#catalog{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style><main><header><h1>Fox · State studio</h1><p>32-state production catalog · Original-art 2D mesh animation · Studies are not live replacements</p></header><section><div class="viewer"><div id="stage"></div><h2 id="stateTitle"></h2><p id="description"></p><p id="status" role="status"></p><button id="play">Pause</button><label><input id="small" type="checkbox">Actual HUD size</label><select id="background" aria-label="Background"><option value="light">Light</option><option value="dark">Dark</option></select><div><input id="time" aria-label="Timeline" type="range" min="0" max="12" step=".01"><output>0.00 s</output></div></div><nav id="catalog" aria-label="Fox states"></nav></section></main><script>globalThis.sources=${JSON.stringify(sources)}</script><script type="module">${result.outputFiles[0].text}</script></html>`);
console.log('output/companion/state-studio.html');
