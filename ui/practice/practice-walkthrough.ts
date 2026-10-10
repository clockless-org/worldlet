import {themeAppletIcon} from '../themes/index.ts';
// Bounded, locally persisted practice artifacts. No remote services or CLI calls.
export function createPracticeWalkthrough({root,scene,home,storage,show}){
 const key='worldlet-practice-walkthrough-v1';
 let state:any;try{state=JSON.parse(storage.getItem(key)||'{}')}catch{state={}}
 let running=false,device:HTMLButtonElement|null=null,panel:HTMLElement|null=null;
 const save=()=>storage.setItem(key,JSON.stringify(state));
 const make=(tag,text='',css='')=>{const e=document.createElement(tag);e.textContent=text;e.style.cssText=css;return e;};
 const style=make('style',"[data-depth]:not([data-depth='overview']) .practice-local-device,[data-depth]:not([data-depth='overview']) .practice-local-panel{display:none!important}");root.append(style);
 function report(text){show({source:'practice-workflow',text,takeover:true});}
 async function wait(ms,signal){if(signal?.aborted)throw Error('Stopped');await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(Error('Stopped'))};const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve()},ms);signal?.addEventListener('abort',cancel,{once:true});});}
 async function flight(id,inbound,label,signal){
  const stage=root.querySelector('#notionStage').getBoundingClientRect(),base=root.getBoundingClientRect(),point=scene()?.devicePoint?.(id),fox=root.querySelector('.companion-avatar')?.getBoundingClientRect();
  if(!point||!fox)throw Error('World is not ready. Return to the world and try again.');
  const a={x:point.x+stage.left-base.left,y:point.y+stage.top-base.top},b={x:fox.x+fox.width/2-base.left,y:fox.y+fox.height*.3-base.top};const from=inbound?a:b,to=inbound?b:a;
  const marker=make('span',label,'position:absolute;max-width:280px;text-align:center;z-index:44;pointer-events:none;padding:9px 14px;border-radius:12px;background:#f8f5e8;color:#284432;border:1px solid #a6ba8d;font:600 16px system-ui;box-shadow:0 4px 18px #213b2820');marker.style.left=(a.x-90)+'px';marker.style.top=(a.y-66)+'px';root.append(marker);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const curve=`M ${from.x} ${from.y} Q ${(from.x+to.x)/2} ${Math.min(from.y,to.y)-100} ${to.x} ${to.y}`;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:45;overflow:visible';
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',curve);path.setAttribute('pathLength','100');path.setAttribute('fill','none');path.setAttribute('stroke','#fff1a0');path.setAttribute('stroke-width','7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-dasharray','18 100');path.style.filter='drop-shadow(0 0 7px #a7c775)';svg.append(path);root.append(svg);
  const halo=make('span','','position:absolute;width:150px;height:80px;border:3px solid #fff0a2;border-radius:50%;background:#dceb9329;box-shadow:0 0 26px 9px #e1ed8c70;pointer-events:none;z-index:43');halo.style.left=(a.x-75)+'px';halo.style.top=(a.y-34)+'px';root.append(halo);
  const foxHalo=make('span','','position:absolute;width:94px;height:65px;border:2px solid #ffe89a;border-radius:50%;box-shadow:0 0 20px #e1ed8c80;pointer-events:none;z-index:43');foxHalo.style.left=(b.x-47)+'px';foxHalo.style.top=(b.y-15)+'px';root.append(foxHalo);
  const dot=make('span','','position:absolute;left:0;top:0;width:18px;height:18px;border-radius:50%;background:#fff9cd;box-shadow:0 0 0 5px #b1c77580,0 0 24px 9px #ffd86bbb;pointer-events:none;z-index:46');dot.style.offsetPath=`path("${curve}")`;dot.style.offsetAnchor='center';root.append(dot);
  const duration=reduced?1:2400;
  const motion=dot.animate([{offsetDistance:'0%'},{offsetDistance:'100%'}],{duration,easing:'ease-in-out',fill:'forwards'});
  const trail=path.animate([{strokeDashoffset:'18'},{strokeDashoffset:'-100'}],{duration,easing:'ease-in-out',fill:'forwards'});
  const pulse=halo.animate([{opacity:.55},{opacity:1},{opacity:.55}],{duration:reduced?1:1200,iterations:reduced?1:2});
  try{await wait(reduced?100:2700,signal);}finally{motion.cancel();trail.cancel();pulse.cancel();dot.remove();svg.remove();halo.remove();foxHalo.remove();marker.remove();}

 }
 function card(){
  panel?.remove();if(!state.applet)return;
  const a=state.applet;panel=make('section','','position:absolute;left:26%;top:22%;width:38%;max-height:60%;overflow:auto;padding:30px;border-radius:24px;background:#f9f6e9;color:#243e30;border:1px solid #bbcaad;box-shadow:0 20px 60px #29422d24;z-index:47;font:18px system-ui');panel.className='practice-local-panel';panel.setAttribute('aria-label',a.title);
  panel.append(make('p','YOUR APPLET · LOCAL CHECKLIST','font-size:12px;letter-spacing:2px;color:#6c7f59'),make('h2',a.title));
  a.items.forEach((item,i)=>{const row=make('label','','display:flex;gap:15px;align-items:center;margin:20px 0');const box=document.createElement('input');box.type='checkbox';box.checked=!!item.done;box.style.cssText='width:22px;height:22px;accent-color:#698650';box.onchange=()=>{state.applet.items[i].done=box.checked;save()};row.append(box,make('span',item.text));panel.append(row)});
  panel.append(make('p','Saved on this device · Built from a checklist template','font-size:12px;color:#778367'));
  const close=make('button','Back to world','border:1px solid #b7c8a4;background:#edf1df;color:#29412e;padding:10px 18px;border-radius:12px;cursor:pointer');close.onclick=()=>{panel.remove();panel=null};panel.append(close);root.append(panel);
 }
 function place(){
  device?.remove();if(!state.applet?.visible)return;
  const a=state.applet;device=document.createElement('button');device.type='button';device.className='practice-local-device';device.setAttribute('aria-label',a.title);device.style.cssText='position:absolute;left:62%;top:60%;width:128px;border:0;background:transparent;color:#284131;z-index:40;cursor:pointer;font:600 14px system-ui;filter:drop-shadow(0 6px 5px #32452230)';
  const img=document.createElement('img');img.src=themeAppletIcon('apple-notes')||'';img.alt='';img.style.cssText='display:block;width:100%;height:104px;object-fit:contain';device.append(img,make('span',a.title,'display:inline-block;background:#f5f2e8e8;border-radius:8px;padding:5px 9px'));device.onclick=card;root.append(device);device.animate([{opacity:0,transform:'translateY(12px) scale(.9)'},{opacity:1,transform:'none'}],{duration:700,easing:'ease-out'});
 }
 async function iteration(meta){
  if(running)return {error:'The practice iteration is already running.'};running=true;home();panel?.remove();
  try{
   state.iteration={status:'running',meeting:{title:'Engineering design review',decisions:['Keep the world visible while Fox coordinates work.','Show readable handoff signals between Applets and Fox.','Preserve the original source and show a reviewable result.']},artifacts:[]};save();await wait(1000,meta?.signal);
   report('Reading the decisions from our last engineering design meeting.');await flight('app-google-calendar',true,'Meeting decisions',meta?.signal);
   const doc={title:'World task handoffs — implementation plan',source:'Engineering design review',body:state.iteration.meeting.decisions.map((x,i)=>`${i+1}. ${x}`).join('\n')};state.iteration.doc=doc;save();
   report('Writing the implementation plan into the practice Notion document.');await flight('app-notion',false,'Implementation doc',meta?.signal);await wait(900,meta?.signal);await flight('app-notion',true,'Plan + acceptance criteria',meta?.signal);
   report('Passing the plan and its source context to the practice Codex task.');await flight('app-codex',false,'Implement iteration',meta?.signal);scene()?.setAppActivity?.('app-codex',{sessions:[{status:'Running'}]});await wait(4000,meta?.signal);
   state.iteration.result={status:'prepared',summary:'World handoff signals, source context and review state',scope:'Authored implementation result; no CLI run'};save();await flight('app-codex',true,'Changes ready for review',meta?.signal);scene()?.setAppActivity?.('app-codex',{sessions:[]});
   report('Preparing the practice GitHub pull request.');await flight('app-github',false,'Pull request',meta?.signal);state.iteration.pr={title:'Show cross-Applet task handoffs in the world',status:'ready for review',local:true};state.iteration.status='complete';save();
   report('**Iteration ready for review.**\n\nCalendar decisions → Notion plan → Codex task → GitHub pull request.\n\n*Practice result saved locally. No external PR or CLI execution.*');
   return {ok:true,fictional:true,scope:'Local practice artifacts only; no remote write or CLI execution',...state.iteration};
  }catch(e){state.iteration.status='stopped';save();return {error:e.message,fictional:true};}finally{running=false;scene()?.setAppActivity?.('app-codex',{sessions:[]});}
 }
 if(state.applet?.visible)place();
 return {async execute(name,args,meta){
  if(name==='run_practice_iteration')return iteration(meta);
  if(!['create','show','hide'].includes(args?.action))return {error:'Choose create, show or hide.'};
  home();
  if(args.action==='create'){
   if(typeof args.title!=='string'||!args.title.trim()||args.title.length>60||!Array.isArray(args.items)||!args.items.length||args.items.length>8||args.items.some(x=>typeof x!=='string'||!x.trim()||x.length>100))return {error:'Provide a title and one to eight short checklist items.'};
   state.applet={title:args.title.trim(),items:args.items.map(text=>({text,done:false})),visible:true};save();place();report('Your **'+state.applet.title+'** checklist is ready in your world. Open it to check items off. It is saved locally.');
  }else if(!state.applet)return {error:'Ask me to create a checklist first.'};
  else if(args.action==='show'){state.applet.visible=true;save();place();}
  else {panel?.remove();panel=null;if(device){const d=device;d.animate([{opacity:1},{opacity:0,transform:'translateY(8px)'}],{duration:700,fill:'forwards'});setTimeout(()=>d.remove(),710);device=null;}state.applet.visible=false;save();}
  return {ok:true,scope:'Functional local checklist template; not arbitrary code generation',applet:state.applet};
 }};
}
