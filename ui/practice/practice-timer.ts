// A real, local prototype used by the authored design-to-Codex walkthrough.
// The code is product-owned, never executable model output.
export function mountPracticeTimer(host,{read,save,onChange}){
 const face=document.createElement('section');face.className='practice-timer';
 const label=document.createElement('p');label.textContent='One useful piece of work';
 const clock=document.createElement('strong');clock.setAttribute('role','timer');
 const status=document.createElement('p');status.className='ui-caption';
 face.append(label,clock,status);host.append(face);
 const remaining=()=>{const state=read();return state.deadline?Math.max(0,state.deadline-Date.now()):(state.remaining??1500000)};
 const draw=()=>{if(!face.isConnected){clearInterval(tick);return;}const ms=remaining(),state=read();clock.textContent=Math.floor(Math.ceil(ms/1000)/60).toString().padStart(2,'0')+':'+(Math.ceil(ms/1000)%60).toString().padStart(2,'0');status.textContent=ms===0?'Session complete':state.deadline?'Focus time':'Ready when you are';};
 const tick=setInterval(draw,250);draw();
 return {action(kind){if(kind==='start'&&read().deadline&&remaining()>0)return;const ms=remaining();save(kind==='reset'?{remaining:1500000}:kind==='pause'?{remaining:ms}:{deadline:Date.now()+(ms||1500000)});draw();onChange();},stop(){clearInterval(tick)}};
}

export const practiceTimerHTML=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Quiet focus timer</title><style>body{margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;background:#f5f0df;color:#274538;font:18px system-ui}output{display:block;font-size:96px;font-variant-numeric:tabular-nums;margin:24px}button{font:inherit;border:1px solid #b4baa9;background:#fff9;border-radius:22px;padding:10px 20px;margin:5px;color:inherit}</style><h1>Quiet focus timer</h1><p>One useful piece of work.</p><output aria-label="Time remaining">25:00</output><nav><button id="start">Start</button><button id="pause">Pause</button><button id="reset">Reset</button></nav><script>let left=1500000,until=0;const remaining=()=>until?Math.max(0,until-Date.now()):left;function draw(){const s=Math.ceil(remaining()/1000);document.querySelector('output').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}document.querySelector('#start').onclick=()=>{if(!until)until=Date.now()+(left||1500000)};document.querySelector('#pause').onclick=()=>{left=remaining();until=0};document.querySelector('#reset').onclick=()=>{left=1500000;until=0;draw()};setInterval(draw,250);</script></html>`;
