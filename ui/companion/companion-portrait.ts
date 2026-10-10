import {loadThemeSpriteRig} from './animation/theme-sprite-rig.ts';
import {companionFrame,companionPose,companionMotion,FOX_IDLE_TIMING} from './animation/companion-frames.ts';
import {ambientPose,companionPreviewDuration,companionPreviewActions} from './companion-life.ts';
import {loadPaintedFox} from './animation/fox-painted-actions.ts';
import {loadAnatomyFox} from './animation/fox-anatomy-runtime.ts';
import {loadRiveFox} from './animation/fox-rive.ts';
import {companionLook,followCompanionLook} from './companion-look.ts';
import {isFoxForegroundActivity} from '../../contracts/companion-activity.ts';
import {createFoxSurfaceTiming,registerFoxFrameTiming} from './fox-frame-timing.ts';
import {WORLD_FRAME_RATE,foxFrameRate,frameDue,windowActive} from '../world/index.ts';
import {isDesktopCompanion} from './world-surface.ts';
import {FOX_DEV_PREVIEW_EVENT} from './fox-dev-preview.ts';
// The Rive Fox, with the painted Fox and then the expression atlas as fallbacks. No per-frame model calls.
export function mountCompanionPortrait(host,options={}){
 return mountPortrait(host,options);
}
function mountPortrait(host,{bust=false}={}){
 const assets=(globalThis as any).__WORLDLET_ENV_ASSETS__||{};
 // Either authored Fox (Rive, or the draft anatomy rig) performs all 32 catalog states.
 const authored=Boolean(assets.companionSpriteRig||assets.companionRive||assets.companionAnatomy);
 const previewActions=companionPreviewActions(authored);
 const halo=document.createElement('span');halo.className='companion-halo';halo.setAttribute('aria-hidden','true');
 const canvas=document.createElement('canvas');canvas.className='companion-model companion-sprite';canvas.setAttribute('aria-hidden','true');canvas.width=320;canvas.height=320;
 const timing=authored?createFoxSurfaceTiming():undefined;
 const releaseTiming=timing?registerFoxFrameTiming(canvas,timing):()=>{};
 const observeTiming=()=>timing?.observe(performance.now(),isDesktopCompanion()?'desktop':'world',document.hidden,document.hasFocus());
 if(timing){observeTiming();window.addEventListener('focus',observeTiming);window.addEventListener('blur',observeTiming);document.addEventListener('visibilitychange',observeTiming);}
 const ctx=canvas.getContext('2d'),sheet=new Image(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 host.classList.add('companion-cozy');if(bust)host.classList.add('companion-bust');host.append(halo,canvas);
 let useAtlas=!!assets.companionExpressions;
 let disposed=false,loaded=false,timer:ReturnType<typeof setTimeout>,frame=-1,started=performance.now(),boxes:number[][]=[],bodyScale=1;
 let animationRequest=0;
 let lastActivity=started,wakeUntil=0,pose='idle',poseStarted=started,lastDraw=0;
 let animation:Awaited<ReturnType<typeof loadPaintedFox>>|null=null;
 const release=(value:typeof animation)=>{if(value&&'dispose' in value)value.dispose();};
 let playfulPose='',playfulUntil=0,previewIndex=0,wasDragging=false,settleUntil=0;
 const busy=()=>host.classList.contains('companion-avatar')&&['talking','listening','thinking','working','preparing','transcribing','writing'].includes(host.dataset.state);
 const currentState=()=>['thinking','working','preparing','transcribing'].includes(host.dataset.state)&&(isFoxForegroundActivity(host.dataset.activity)||host.dataset.activity==='listening')?host.dataset.activity:host.dataset.state||'idle';
 function cycleAction(event:Event){
  event.preventDefault();event.stopImmediatePropagation();
  if(busy()&&host.dataset.state!=='writing')return;
  // The first click may have opened the composer. Close only its presentation,
  // preserving any draft, before previewing; never alter the actual task state.
  host.dispatchEvent(new Event('worldlet:preview-action'));
  previewIndex=(previewIndex+1)%previewActions.length;playfulPose=previewActions[previewIndex];
  lastActivity=performance.now();playfulUntil=lastActivity+companionPreviewDuration(playfulPose,authored);wakeUntil=0;tick();
 }
 host.addEventListener('dblclick',cycleAction,true);
 const devPreview=(event:Event)=>{
  const state=(event as CustomEvent).detail;
  if(!authored||!host.classList.contains('companion-avatar')||state!==null&&(!previewActions.includes(state)||busy()))return;
  event.preventDefault();
  // Explicitly replaying the same Dev state starts a fresh performance. A
  // different state still uses physical handoffs; real input never resets it.
  if(state!==null&&state===playfulPose&&state===pose){
   if(animation&&'restartPreview' in animation&&typeof animation.restartPreview==='function')animation.restartPreview();
   poseStarted=performance.now();
  }
  playfulPose=state??'';lastActivity=performance.now();playfulUntil=state===null?0:lastActivity+60000;wakeUntil=0;tick();
 };
 // Native chat uses bust framing for the live avatar too; framing is not an
 // ownership test. Only the actual interactive avatar receives Dev requests.
 if(authored&&host.classList.contains('companion-avatar'))host.addEventListener(FOX_DEV_PREVIEW_EVENT,devPreview);
 function activity(event?:Event){
  const now=performance.now();
  if(playfulPose==='blocked'&&event?.type!=='pointerenter'){playfulPose='';playfulUntil=0;}
  if(pose==='sleeping'){playfulUntil=0;wakeUntil=now+(authored?3600:FOX_IDLE_TIMING.wake);}
  lastActivity=now;
  // Input bursts update intent immediately, but paint on the existing frame.
  // Redrawing synchronously for every wheel/key event steals time from animation.
  if(!disposed&&loaded&&!document.hidden&&!animationRequest)animationRequest=requestAnimationFrame(tick);
 }
 const requestedPose=()=>{const requested=host.dataset.requestedPose;if(!['idle','happy','waving','sleeping','blocked'].includes(requested))return;playfulPose=requested;playfulUntil=requested==='blocked'?Infinity:performance.now()+(requested==='sleeping'?120000:6000);wakeUntil=0;tick();};
 const poseObserver=new MutationObserver(requestedPose);poseObserver.observe(host,{attributes:true,attributeFilter:['data-requested-pose']});
 const activityEvents=['pointerdown','keydown','input','wheel','focusin'] as const;
 for(const event of activityEvents)document.addEventListener(event,activity,{passive:true});
 host.addEventListener('pointerenter',activity);
 function draw(index:number,elapsed=0){
  if(!loaded||(index===frame&&reduced.matches))return;
  frame=index;canvas.dataset.frame=String(index);
  const [x,y,w,h]=boxes[index]||boxes[0],scale=useAtlas?bodyScale:Math.min(290/w,300/h);
  const motion=companionMotion(pose,elapsed,reduced.matches);
  ctx.clearRect(0,0,320,320);ctx.save();ctx.translate(160,310-motion.lift);ctx.rotate(motion.angle);ctx.scale(1,1+motion.breath);
  ctx.drawImage(sheet,x,y,w,h,-w*scale/2,-h*scale,w*scale,h*scale);ctx.restore();
 }
 function tick(timestamp?:number|Event){
  clearTimeout(timer);cancelAnimationFrame(animationRequest);animationRequest=0;if(disposed||!loaded)return;
  observeTiming();
  if(document.hidden){timing?.pause();return;}
  const state=currentState(),now=performance.now(),elapsed=now-started;
  if(useAtlas||animation){
   const attentive=document.hasFocus()||!!document.querySelector('.companion-dialogue:not([hidden])');
   const idleFor=attentive?0:now-lastActivity;
   const resting=authored&&state==='idle'&&now<wakeUntil&&!reduced.matches?'waking':companionPose(state,idleFor,now<wakeUntil&&!reduced.matches);
   const dragging=Boolean(host.closest('.is-dragging-fox'));
   if(wasDragging&&!dragging)settleUntil=now+1600;
   wasDragging=dragging;
   const dragPose=authored&&!busy()?(dragging?'pickup':now<settleUntil?'settle':null):null;
   const smallAction=resting==='idle'&&state==='idle'&&!reduced.matches&&!host.closest('.is-dragging-fox')?ambientPose(elapsed,authored):null;
   const next=dragPose||(playfulPose&&now<playfulUntil&&!busy()?playfulPose:smallAction||resting);
   const changed=next!==pose;
   if(changed){pose=next;poseStarted=now;}
   host.dataset.pose=pose;canvas.dataset.pose=pose;
   // A resting Fox draws at a lower rate (frame-budget.ts); a pose change or a direct request draws now.
   const lively=changed||dragging||!!dragPose||busy()||!!playfulPose&&!['sleeping','blocked'].includes(playfulPose)&&now<playfulUntil||now-lastActivity<WORLD_FRAME_RATE.wakeMs;
   if(typeof timestamp==='number'&&!reduced.matches&&!frameDue(now,lastDraw,foxFrameRate({moving:lively,windowActive:windowActive()}))){animationRequest=requestAnimationFrame(tick);return;}
   lastDraw=now;
   if(animation){
    canvas.dataset.frame=String(companionFrame(pose,now-poseStarted,reduced.matches));
    const begin=timing?performance.now():0;
    const sample=animation.draw(ctx,pose,now-poseStarted,now,reduced.matches);
    timing?.record(begin,performance.now()-begin,typeof timestamp==='number'?timestamp:undefined,sample.key,isDesktopCompanion()?'desktop':'world','timingPhase' in sample?sample.timingPhase:undefined);
    canvas.dataset.animationFrame=sample.key;
   }else draw(companionFrame(pose,now-poseStarted,reduced.matches),now-poseStarted);
   // Reduced motion still permits semantic changes (e.g. idle to asleep).
   if(reduced.matches)timer=setTimeout(tick,1000);else animationRequest=requestAnimationFrame(tick);return;
  }
  const thoughtful=['thinking','working','transcribing','preparing'].includes(state);
  if(reduced.matches){draw(thoughtful?3:0);return;}
  const blinking=elapsed%4600>4440;
  draw(blinking?1:state==='talking'?(Math.floor(elapsed/190)%2?2:0):thoughtful?3:0);
  timer=setTimeout(tick,80);
 }
 let lastState=host.dataset.state;
 const observer=new MutationObserver(()=>{const state=currentState();if(state===lastState)return;lastState=state;started=performance.now();lastActivity=started;wakeUntil=0;if(busy()&&playfulPose!=='sleeping')playfulUntil=0;tick();});observer.observe(host,{attributes:true,attributeFilter:['data-state','data-activity']});
 const motionChanged=()=>{frame=-1;timing?.pause();tick();};
 reduced.addEventListener('change',motionChanged);document.addEventListener('visibilitychange',tick);
 sheet.onload=()=>{
  if(disposed)return;
  const atlas=useAtlas,columns=atlas?4:1,cellW=sheet.naturalWidth/columns,cellH=sheet.naturalHeight/columns;
  if(!atlas){boxes=[[0,0,cellW,cellH]];loaded=true;tick();return;}
  const mask=document.createElement('canvas');mask.width=sheet.naturalWidth;mask.height=sheet.naturalHeight;const m=mask.getContext('2d',{willReadFrequently:true});m.drawImage(sheet,0,0);const data=m.getImageData(0,0,mask.width,mask.height).data;
  // Register each frame by its opaque body bounds, ignoring transparent gutters.
  boxes=[];
  for(let n=0;n<columns*columns;n++){
   // Authored cell boundaries: generated rows are not an exact uniform grid.
   const xs=[0,326,642,951,1254],ys=[0,324,640,949,1254],base=1254;
   const col=n%columns,row=Math.floor(n/columns),ox=Math.round(xs[col]/base*sheet.naturalWidth),oy=Math.round(ys[row]/base*sheet.naturalHeight);
   const cw=Math.round(xs[col+1]/base*sheet.naturalWidth)-ox,ch=Math.round(ys[row+1]/base*sheet.naturalHeight)-oy;
   let left=cw,top=ch,right=0,bottom=0;
   for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(data[((oy+y)*mask.width+ox+x)*4+3]>200){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   boxes.push(right>left?[ox+left,oy+top,right-left+1,bottom-top+1]:[ox,oy,cellW,cellH]);
  }
  // One physical scale for every pose. A curled fox must remain shorter.
  bodyScale=Math.min(...boxes.map(([, ,w,h])=>Math.min(290/w,300/h)));
  loaded=true;tick();
 };
 sheet.onerror=()=>{if(disposed)return;if(sheet.src.endsWith('fox-startup.png'))return;useAtlas=false;sheet.src=assets.companionPortrait||'assets/fox-startup.png';};
 sheet.src=assets.companionExpressions||assets.companionPortrait||'assets/fox-startup.png';
 if(assets.companionSpriteRig)void loadThemeSpriteRig(assets.companionSpriteRig).then(value=>{if(!disposed){animation=value;loaded=true;tick();}else value.dispose();}).catch(()=>{canvas.dataset.animationFallback='theme-portrait';});
 if(assets.companionPainted)void (async()=>{
  // Opt-in only: keep unauthored states explicit and on the existing renderer.
  if(authored){
   const fallback=await loadPaintedFox(assets.companionPainted);
   try{
    // Rive first; the draft anatomy rig stays as the development fallback.
    const anatomy=await (assets.companionRive?loadRiveFox(assets.companionRive,canvas,companionLook()).catch(error=>{
     canvas.dataset.animationFallback='rive-load';if(!assets.companionAnatomy)throw error;return loadAnatomyFox(assets.companionAnatomy,canvas);
    }):loadAnatomyFox(assets.companionAnatomy,canvas));
    if(!disposed){canvas.width=640;canvas.height=640;}
    // The Rive Fox wears the companion's look; a change shows on the next frame.
    const unfollow='setLook' in anatomy?followCompanionLook(look=>void anatomy.setLook(look).then(()=>tick())):()=>{};
    let wasSupported=true;
    return {draw(ctx,state,elapsed,now,reduced){
     const supported=anatomy.supports(state);
     if(!supported&&wasSupported)anatomy.reset();
     wasSupported=supported;
     canvas.dataset.anatomyFallback=supported?'':state;
     return (supported?anatomy:fallback).draw(ctx,state,elapsed,now,reduced);
    },restartPreview(){anatomy.reset();},dispose(){unfollow();anatomy.dispose();fallback.dispose();}};
   }catch{canvas.dataset.animationFallback='anatomy-load';return fallback;}
  }
  try{const painted=await loadPaintedFox(assets.companionPainted);if(!disposed){canvas.width=640;canvas.height=640;}return painted;}catch{canvas.dataset.animationFallback='true';return null;}
 })().then(value=>{if(!disposed){animation=value;loaded=true;tick();}else release(value);}).catch(()=>{canvas.dataset.animationFallback='true';});
 return ()=>{disposed=true;releaseTiming();release(animation);clearTimeout(timer);cancelAnimationFrame(animationRequest);observer.disconnect();poseObserver.disconnect();reduced.removeEventListener('change',motionChanged);document.removeEventListener('visibilitychange',tick);window.removeEventListener('focus',observeTiming);window.removeEventListener('blur',observeTiming);document.removeEventListener('visibilitychange',observeTiming);for(const event of activityEvents)document.removeEventListener(event,activity);host.removeEventListener('pointerenter',activity);host.removeEventListener('dblclick',cycleAction,true);host.removeEventListener(FOX_DEV_PREVIEW_EVENT,devPreview);delete host.dataset.pose;halo.remove();canvas.remove();host.classList.remove('companion-cozy','companion-bust');};
}
