import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root='resources/styles/builtin/assets/companion/painted';
const sources=await Promise.all(['resources/styles/builtin/assets/companion/rig/fallback.png',root+'/half-eye.png',root+'/closed-eye.png'].map(async p=>'data:image/png;base64,'+(await readFile(p)).toString('base64')));
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
import {createPaintedIdle} from './ui/companion/animation/fox-painted-idle.ts';
import {paintedAction} from './ui/companion/animation/fox-painted-actions.ts';
import {FOX_ACTIONS} from './ui/companion/fox-actions.ts';
const canvas=document.querySelector('canvas'),rig=await createPaintedIdle(canvas,globalThis.sources);
let paused=false,time=0,last=performance.now();const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const button=document.querySelector('#play'),slider=document.querySelector('#time'),status=document.querySelector('output');
const select=document.createElement('select');select.setAttribute('aria-label','Action');for(const action of FOX_ACTIONS){const option=document.createElement('option');option.value=option.textContent=action;select.append(option)}button.before(select);select.onchange=()=>{time=0;draw()};
document.querySelector('small').textContent='Built-in painted Fox · seated body gestures · reduced motion supported';
function draw(){const pose=rig.draw(time,reduced.matches,paintedAction(select.value,time,time,reduced.matches));slider.value=String(time/1000);status.value=(time/1000).toFixed(2)+' s';return pose}
button.onclick=()=>{paused=!paused;button.textContent=paused?'Play':'Pause'};
slider.oninput=()=>{paused=true;button.textContent='Play';time=Number(slider.value)*1000;draw()};
document.querySelector('#still').onchange=e=>{canvas.style.visibility=e.target.checked?'hidden':'visible'};
globalThis.foxStudy={draw(ms,override){time=ms;paused=true;button.textContent='Play';slider.value=String(ms/1000);status.value=(ms/1000).toFixed(2)+' s';return rig.draw(ms,false,{...paintedAction(select.value,ms,ms),...override})},rig};
document.body.dataset.ready='true';
function tick(now){if(!paused&&!document.hidden){time=(time+Math.min(50,now-last))%12000;draw()}last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);
`},bundle:true,write:false,format:'esm'});
await mkdir('output/companion',{recursive:true});
await writeFile('output/companion/painted-idle.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fox · Painted idle study</title><style>
body{margin:0;background:#e8e7df;color:#36463d;font:15px system-ui}main{max-width:700px;margin:auto;padding:24px;text-align:center}h1{font-size:23px;font-weight:550}p{line-height:1.5;color:#657268}.stage{position:relative;width:min(480px,88vw);aspect-ratio:1;margin:auto}.stage img,.stage canvas{position:absolute;inset:0;width:100%;height:100%}.stage img{opacity:1}canvas{background:#e8e7df}button{padding:9px 22px;border:1px solid #a8b1a955;border-radius:18px;background:#ffffff66;color:inherit;font:inherit}input[type=range]{width:min(360px,70vw);vertical-align:middle}label{display:inline-block;margin:12px}output{font-variant-numeric:tabular-nums;display:inline-block;min-width:55px}small{display:block;color:#69746b;margin:12px}</style><main><h1>Fox · Painted idle</h1><p>Original illustration · local mesh deformation · painted eyelids</p><div class="stage"><img alt="Original Fox illustration" src="${sources[0]}"><canvas width="960" height="960" aria-label="Animated Fox idle study"></canvas></div><button id="play">Pause</button><label><input id="still" type="checkbox"> Original reference</label><div><input id="time" aria-label="Timeline" type="range" min="0" max="12" step=".01" value="0"> <output>0.00 s</output></div><small>Draft preview only — live Fox is unchanged. Reduced motion is respected.</small></main><script>globalThis.sources=${JSON.stringify(sources)}</script><script type="module">${result.outputFiles[0].text}</script></html>`);
console.log('output/companion/painted-idle.html');
