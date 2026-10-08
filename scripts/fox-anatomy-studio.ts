import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import readingGripDefinition from '../resources/styles/builtin/drafts/fox-states-v1/reading-grip-parts-v1.json' with {type:'json'};
import {FOX_ANATOMY} from '../ui/companion/fox-anatomy.ts';
const source='data:image/png;base64,'+(await readFile('resources/styles/builtin/assets/companion/rig/fallback.png')).toString('base64');
const body='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/body-underpaint.png')).toString('base64');
const limbs='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/complete-forelimbs.png')).toString('base64');
const reading='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/reading-parts.png')).toString('base64');
const readingGripSources=Object.fromEntries(await Promise.all((['upper','forearm'] as const).map(async part=>[part,'data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/'+readingGripDefinition[part].atlas)).toString('base64')])));
const drafting='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/drafting-parts-v1.png')).toString('base64');
const draftingRelease='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/drafting-release-v1.png')).toString('base64');
const turnArm='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/reading-turn-arm.png')).toString('base64');
const earRoots='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/ear-root-underpaint.png')).toString('base64');
const neck='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/neck-underpaint.png')).toString('base64');
const openPalm='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/'+FOX_ANATOMY.registeredArt.openPalmR.file)).toString('base64');
const workstation='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/working-device.png')).toString('base64');
const magnifier='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/search-magnifier.png')).toString('base64');
const searchDock='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/search-dock.png')).toString('base64');
const graspParts='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/paw-grasp-parts-v1.png')).toString('base64');
const sidePalm='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/paw-side-v1.png')).toString('base64');
const eyes=Object.fromEntries(await Promise.all(['half','closed'].map(async id=>[id,'data:image/png;base64,'+(await readFile('resources/styles/builtin/assets/companion/painted/'+id+'-eye.png')).toString('base64')])));
eyes.down='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/reading-eyes.png')).toString('base64');
eyes.underpaint='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/eyelid-underpaint-v1.png')).toString('base64');
eyes.sclera='data:image/png;base64,'+(await readFile('resources/styles/builtin/drafts/fox-states-v1/eye-sclera-underpaint-v1.png')).toString('base64');
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
import {searchPickupReview} from './ui/companion/fox-search-pickup-player.ts';
import {searchPickupStudy} from './ui/companion/fox-search-pickup-study.ts';
import {FOX_ANATOMY} from './ui/companion/fox-anatomy.ts';
import {createAnatomyInspector} from './ui/companion/fox-anatomy-inspector.ts';
import {anatomyStudy,ANATOMY_STUDY_DURATION} from './ui/companion/fox-anatomy-clips.ts';
import {anatomyTransitionStudy} from './ui/companion/fox-anatomy-transition-study.ts';
import {anatomyHold,anatomyHoldReview,ANATOMY_CONVERSATION_REVIEW_EVENTS,ANATOMY_WAIT_REVIEW_EVENTS} from './ui/companion/fox-anatomy-hold.ts';
import {readingExpression} from './ui/companion/fox-reading-study.ts';
import {readingFinish} from './ui/companion/fox-reading-finish.ts';
import {readingClose} from './ui/companion/fox-reading-close.ts';
import {readingRest} from './ui/companion/fox-reading-rest.ts';
import {readingResume} from './ui/companion/fox-reading-resume.ts';
import {readingReply,readingReplyInterruptReview} from './ui/companion/fox-reading-reply.ts';
import {readingHandlingReview,READING_HANDLING_EVENTS} from './ui/companion/fox-reading-handling.ts';
let handlingEvents=[...READING_HANDLING_EVENTS];
import {draftingBodyFrame} from './ui/companion/fox-drafting-motion.ts';
import {draftingFinish} from './ui/companion/fox-drafting-finish.ts';
import {anatomyResponseReview,ANATOMY_SEARCH_REVIEW_EVENTS,ANATOMY_ATTENTION_REVIEW_EVENTS,ANATOMY_READING_REVIEW_EVENTS,ANATOMY_BOOK_REVIEW_EVENTS,ANATOMY_GESTURE_REVIEW_EVENTS} from './ui/companion/fox-anatomy-performance.ts';
const durations={...ANATOMY_STUDY_DURATION,transition:11600,reading:9000,'reading-turn':9000,'listening-hold':60000,'thinking-hold':60000,'explaining-hold':60000,'working-hold':60000,'searching-hold':60000,'awaiting_user-hold':60000,'awaiting_service-hold':60000,'urgent-hold':60000,'attention-flow':24000,'waiting-flow':42000,'search-flow':42000,'hold-transition':36000,conversation:42000,response:14500};
durations['blocked-hold']=60000;durations['gesture-flow']=15500;durations['working-flow']=24000;durations['greeting-rest']=14000;durations['idle-hold']=60000;durations['reading-flow']=25000;durations['search-pickup']=12000;durations['search-pickup-flow']=14000;
const sampleMotion=(id,t,reduce)=>{
 if(id==='reading-reply-interrupt')return {...readingReplyInterruptReview(t,reduce),frontPaws:[]};
 if(id==='reading-reply')return {...readingReply({time:5100,pageTime:5100,rate:1},t,reduce),frontPaws:[]};
 if(id.endsWith('-hold')||id==='hold-transition'||id==='conversation'||id==='response'||id==='search-flow'||id==='waiting-flow'||id==='attention-flow'){const frame=id==='attention-flow'?anatomyResponseReview(t,reduce,ANATOMY_ATTENTION_REVIEW_EVENTS):id==='waiting-flow'?anatomyHoldReview(t,reduce,ANATOMY_WAIT_REVIEW_EVENTS):id==='search-flow'?anatomyResponseReview(t,reduce,ANATOMY_SEARCH_REVIEW_EVENTS):id==='response'?anatomyResponseReview(t,reduce):id==='conversation'?anatomyHoldReview(t,reduce,ANATOMY_CONVERSATION_REVIEW_EVENTS):id==='hold-transition'?anatomyHoldReview(t,reduce):anatomyHold(id.replace('-hold',''),t,reduce);return {pose:frame.pose,frontMix:frame.front,frontPaws:[],gazeDown:frame.gazeDown,pawTurnR:frame.pawTurnR,workstation:frame.workstation,magnifier:frame.magnifier};}if(id.startsWith('reading')){const e=readingExpression(t,reduce);return {pose:{lidL:{closure:e.closure},lidR:{closure:e.closure}},frontPaws:[],gazeDown:e.gazeDown};}return id==='transition'?anatomyTransitionStudy(t,reduce):anatomyStudy(id,t,reduce);};
const canvas=document.querySelector('canvas'),rig=await createAnatomyInspector(canvas,globalThis.source,globalThis.eyes,${JSON.stringify(body)},${JSON.stringify(limbs)},${JSON.stringify(reading)},${JSON.stringify(turnArm)},${JSON.stringify(earRoots)},${JSON.stringify(neck)},${JSON.stringify(openPalm)},${JSON.stringify(workstation)},${JSON.stringify(magnifier)},${JSON.stringify(searchDock)},${JSON.stringify(graspParts)},${JSON.stringify(sidePalm)},${JSON.stringify({held:drafting,release:draftingRelease})},${JSON.stringify(readingGripSources)}),joint=document.querySelector('#joint'),angle=document.querySelector('#angle'),part=document.querySelector('#part'),status=document.querySelector('#status');
durations['drafting-study']=14400;durations['drafting-interrupt']=12000;durations['drafting-release']=6000;
durations['reading-finish']=5200;
durations['reading-reply']=6500;
durations['reading-reply-interrupt']=9000;
durations['reading-close']=6800;
durations['reading-rest']=10000;
durations['reading-resume']=7200;
durations['reading-handling']=20000;
durations['reading-book-flow']=34000;
durations['drafting-notebook']=4000;
durations['drafting-finish']=7500;
function draftingFrame(id,t,reduce){
 if(id==='drafting-finish')return {...draftingFinish(1300,t,reduce),frontPaws:[]};
 if(id==='drafting-notebook')return {...draftingBodyFrame(1500,reduce,0,t),frontPaws:[],drafting:{time:1500,notebookRestTime:t,reduced:reduce}};
 if(id==='drafting-release')return {...draftingBodyFrame(1500,reduce,0,t),frontPaws:[],drafting:{time:1500,releaseTime:t,reduced:reduce}};
 const events=id==='drafting-interrupt'?[[0,'drafting'],[1400,'listening'],[4000,'drafting'],[4150,'listening'],[4230,'drafting'],[7000,'listening'],[9500,'drafting']]:[[0,'drafting']];
 const frame=anatomyResponseReview(t,reduce,events);
 return {...frame,frontPaws:[],frontMix:frame.front};
}
let pose={},frontPaws=[],motion=null,motionTime=0,playing=false,last=performance.now(),raf=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const authored=document.createElement('input'),artLabel=document.createElement('label');authored.type='checkbox';authored.id='authored';artLabel.append(authored,'Complete limb art · registration study');document.querySelector('aside').prepend(artLabel);authored.oninput=()=>draw();
const gpu=document.createElement('input'),gpuLabel=document.createElement('label');gpu.type='checkbox';gpu.id='gpu';gpuLabel.append(gpu,'GPU skin preview');artLabel.after(gpuLabel);
const gpuFrame=document.createElement('input'),frameLabel=document.createElement('label');gpuFrame.type='checkbox';gpuFrame.id='gpu-frame';frameLabel.append(gpuFrame,'GPU whole-frame preview');gpuLabel.after(frameLabel);
const eyeDraft=document.createElement('input'),eyeLabel=document.createElement('label');eyeDraft.type='checkbox';eyeDraft.id='eye-occlusion';eyeLabel.append(eyeDraft,'Independent eyelids · gaze study');frameLabel.after(eyeLabel);eyeDraft.oninput=()=>draw();
const graspDraft=document.createElement('input'),graspLabel=document.createElement('label'),curl=document.createElement('input');graspDraft.type='checkbox';graspDraft.id='grasp-draft';curl.type='range';curl.id='grasp-curl';curl.min=0;curl.max=1;curl.step=.01;curl.value=0;curl.setAttribute('aria-label','Draft finger curl');graspLabel.append(graspDraft,'Draft articulated right paw',curl);frameLabel.after(graspLabel);graspDraft.oninput=()=>draw();curl.oninput=()=>draw();
const sideDraft=document.createElement('input'),sideLabel=document.createElement('label');sideDraft.type='checkbox';sideDraft.id='side-palm-draft';sideLabel.append(sideDraft,'Painted side-paw draft');graspLabel.after(sideLabel);sideDraft.oninput=()=>draw();
const readingGripDraft=document.createElement('input'),readingGripLabel=document.createElement('label');readingGripDraft.type='checkbox';readingGripDraft.id='reading-grip-draft';readingGripLabel.append(readingGripDraft,'Complete reading arms · draft');sideLabel.after(readingGripLabel);readingGripDraft.oninput=()=>draw();
const drawReference=rig.draw;rig.draw=(pose,options)=>drawReference(pose,{readingGrip:readingGripDraft.checked,eyeOcclusion:eyeDraft.checked,gpu:gpu.checked,gpuFrame:gpuFrame.checked,sidePalmR:sideDraft.checked,...graspDraft.checked?{graspR:{thumb:+curl.value,index:+curl.value,middle:+curl.value,outer:+curl.value}}:{},...options});gpu.oninput=()=>{draw();gpuLabel.title=JSON.stringify(rig.skinStats());};gpuFrame.oninput=()=>{draw();frameLabel.title=JSON.stringify(rig.skinStats());};
globalThis.foxSkinStats=rig.skinStats;
for(const j of FOX_ANATOMY.joints){const option=document.createElement('option');option.value=j.id;option.textContent=j.id;joint.append(option);}
for(const p of rig.layers){const option=document.createElement('option');option.value=p.id;option.textContent=p.id+' · '+p.count+' px';part.append(option);}
joint.value='head';part.value='head';
function motionFrame(id,t,reduce){if(id==='reading-book-flow'){const f=anatomyResponseReview(t,reduce,ANATOMY_BOOK_REVIEW_EVENTS);return {...f,frontPaws:[],frontMix:f.front};}if(id==='reading-handling')return {...readingHandlingReview(t,reduce,handlingEvents),frontPaws:[]};if(id==='reading-resume')return {...readingResume({time:5100,pageTime:5100,rate:1},t,reduce),frontPaws:[]};if(id==='reading-rest')return {...readingRest({time:5100,pageTime:5100,rate:1},t,reduce),frontPaws:[]};if(id==='reading-close')return {...readingClose({time:5100,pageTime:5100,rate:1},t,reduce),frontPaws:[]};if(id==='reading-finish')return {...readingFinish({time:5100,pageTime:5100,rate:1},t,reduce),frontPaws:[]};if(id==='working-flow'||id==='greeting-rest'||id==='gesture-flow'){const frame=anatomyResponseReview(t,reduce,id==='gesture-flow'?ANATOMY_GESTURE_REVIEW_EVENTS:id==='working-flow'?[[0,'working'],[1800,'listening'],[7000,'working'],[12000,'listening'],[18000,'working']]:[[0,'greeting']]);return {...frame,frontPaws:[],frontMix:frame.front};}if(id==='search-pickup-flow')return searchPickupReview(t,reduce);if(id==='search-pickup')return searchPickupStudy(t,reduce);if(id!=='reading-flow')return sampleMotion(id,t,reduce);const frame=anatomyResponseReview(t,reduce,ANATOMY_READING_REVIEW_EVENTS);return {...frame,frontPaws:[],frontMix:frame.front};}
function draw(){
 const sample=motion?(motion.startsWith('drafting-')?draftingFrame(motion,motionTime,reduced.matches):motionFrame(motion,motionTime,reduced.matches)):undefined;
 if(sample){pose=sample.pose;frontPaws=sample.frontPaws;timeline.value=motionTime;motionToggle.textContent=playing?'Pause motion':'Play motion';}
 const readingPresentation=sample?.reading??((motion==='reading'||motion==='reading-turn')?{time:motionTime,reduced:reduced.matches,turning:motion==='reading-turn',completeRight:motion==='reading-turn'&&readingGripDraft.checked}:undefined);
 rig.draw(pose,{drafting:sample?.drafting,...sample?.graspR?{graspR:sample.graspR}:{},authored:authored.checked,frontPaws,frontMix:sample?.frontMix,gazeDown:sample?.gazeDown,pawTurnR:sample?.pawTurnR,workstation:sample?.workstation,magnifier:sample?.magnifier,magnifierPose:sample?.magnifierPose,searchDock:motion==='search-pickup'||motion==='search-pickup-flow',reading:readingPresentation,selected:part.value,isolate:document.querySelector('#isolate').checked,anchors:document.querySelector('#anchors').checked,explode:Number(document.querySelector('#explode').value),reference:document.querySelector('#reference').checked});
 const unit=joint.value.startsWith('lid')?' closed':'°';status.textContent=(motion?motion+' '+(motionTime/1000).toFixed(2)+'s · motion study':joint.value+' '+angle.value+unit)+' · '+FOX_ANATOMY.joints.length+' joints / '+(authored.checked?'registered body and limbs, original face':rig.layers.length+' original-pixel layers');document.querySelector('output').textContent=angle.value+unit;
}
function select(){const j=FOX_ANATOMY.joints.find(j=>j.id===joint.value),lid=j.id.startsWith('lid');angle.min=lid?0:-j.limit;angle.max=lid?1:j.limit;angle.step=lid?.01:.1;angle.value=pose[j.id]?.[lid?'closure':'angle']||0;draw();}
joint.onchange=select;angle.oninput=()=>{motion=null;playing=false;pose[joint.value]={[joint.value.startsWith('lid')?'closure':'angle']:Number(angle.value)};draw()};
document.querySelector('#reset').onclick=()=>{motion=null;playing=false;pose={};frontPaws=[];angle.value=0;document.querySelector('#explode').value=0;document.querySelector('#reference').checked=false;document.querySelector('#isolate').checked=false;draw()};
for(const id of ['part','isolate','anchors','explode','reference'])document.querySelector('#'+id).oninput=draw;
document.querySelector('#hud').onchange=e=>canvas.classList.toggle('hud',e.target.checked);
document.querySelector('#dark').onchange=e=>document.querySelector('#stage').classList.toggle('dark',e.target.checked);
const presets=document.createElement('div');document.querySelector('aside').prepend(presets);
for(const [label,value] of [['Raised paw',{upperArmR:{angle:-80},forearmR:{angle:-95},pawR:{angle:10}}],['Chin reach',{upperArmL:{angle:-48},forearmL:{angle:-95},pawL:{angle:0}}]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{motion=null;playing=false;pose=value;authored.checked=true;frontPaws=label==='Chin reach'?['L']:[];select()};presets.append(button);}
const motionControls=document.createElement('div'),motionToggle=document.createElement('button'),timeline=document.createElement('input');
timeline.type='range';timeline.id='motion-time';timeline.min=0;timeline.max=9000;timeline.step=1;timeline.setAttribute('aria-label','Motion timeline');
function start(id){if(id.startsWith('reading'))readingGripDraft.checked=true;motion=id;motionTime=0;playing=!reduced.matches;last=performance.now();timeline.max=durations[id];authored.checked=true;draw();}
for(const [id,label] of [['greeting','Greeting motion'],['listening','Listening motion'],['acknowledging','Acknowledging motion'],['thinking','Thinking motion'],['grooming','Grooming motion'],['explaining','Explaining motion'],['working','Working motion'],['delighted','Delighted motion'],['transition','Interrupted transition'],['reading','Reading motion'],['reading-turn','Page turn study'],['listening-hold','Listening hold'],['thinking-hold','Thinking hold'],['explaining-hold','Explaining hold'],['working-hold','Working hold'],['hold-transition','Hold and interrupt'],['conversation','Conversation flow']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>start(id);motionControls.append(button);}
const responseButton=document.createElement('button');responseButton.textContent='Interrupted response';responseButton.onclick=()=>start('response');motionControls.append(responseButton);
for(const [id,label] of [['drafting-study','Drafting study'],['drafting-interrupt','Drafting and listening'],['drafting-release','Put down and regrasp pencil']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>start(id);motionControls.append(button);}
const notebookButton=document.createElement('button');notebookButton.textContent='Rest notebook on lap';notebookButton.onclick=()=>start('drafting-notebook');motionControls.append(notebookButton);
const finishButton=document.createElement('button');finishButton.textContent='Finish writing sequence';finishButton.onclick=()=>start('drafting-finish');motionControls.append(finishButton);
const stretchButton=document.createElement('button');stretchButton.textContent='Stretching motion';stretchButton.onclick=()=>start('stretching');motionControls.append(stretchButton);
const farewellButton=document.createElement('button');farewellButton.textContent='Farewell motion';farewellButton.onclick=()=>start('farewell');motionControls.append(farewellButton);
const searchButton=document.createElement('button');searchButton.textContent='Searching motion';searchButton.onclick=()=>start('searching');motionControls.append(searchButton);
const pickupButton=document.createElement('button');pickupButton.textContent='Search pickup review';pickupButton.onclick=()=>start('search-pickup');motionControls.append(pickupButton);
const pickupFlowButton=document.createElement('button');pickupFlowButton.textContent='Interrupt pickup review';pickupFlowButton.onclick=()=>start('search-pickup-flow');motionControls.append(pickupFlowButton);
const lookingButton=document.createElement('button');lookingButton.textContent='Looking around';lookingButton.onclick=()=>start('looking');motionControls.append(lookingButton);
const readingFlowButton=document.createElement('button');readingFlowButton.textContent='Reading and listening';readingFlowButton.onclick=()=>start('reading-flow');motionControls.append(readingFlowButton);
const bookFlowButton=document.createElement('button');bookFlowButton.textContent='Read, rest, interrupt and resume';bookFlowButton.onclick=()=>start('reading-book-flow');motionControls.append(bookFlowButton);
const readingFinishButton=document.createElement('button');readingFinishButton.textContent='Finish page and lower book';readingFinishButton.onclick=()=>{readingGripDraft.checked=true;start('reading-finish');};motionControls.append(readingFinishButton);
const readingReplyButton=document.createElement('button');readingReplyButton.textContent='Reply while holding book';readingReplyButton.onclick=()=>{readingGripDraft.checked=true;start('reading-reply');};motionControls.append(readingReplyButton);
const replyInterruptButton=document.createElement('button');replyInterruptButton.textContent='Interrupt held-book reply';replyInterruptButton.onclick=()=>{readingGripDraft.checked=true;start('reading-reply-interrupt');};motionControls.append(replyInterruptButton);
const readingCloseButton=document.createElement('button');readingCloseButton.textContent='Close lowered book';readingCloseButton.onclick=()=>{readingGripDraft.checked=true;start('reading-close');};motionControls.append(readingCloseButton);
const readingRestButton=document.createElement('button');readingRestButton.textContent='Rest book and release hands';readingRestButton.onclick=()=>{readingGripDraft.checked=true;start('reading-rest');};motionControls.append(readingRestButton);
const readingResumeButton=document.createElement('button');readingResumeButton.textContent='Pick up and reopen rested book';readingResumeButton.onclick=()=>{readingGripDraft.checked=true;start('reading-resume');};motionControls.append(readingResumeButton);
const readingHandlingButton=document.createElement('button');readingHandlingButton.textContent='Interrupt book handling';readingHandlingButton.onclick=()=>{handlingEvents=[...READING_HANDLING_EVENTS];readingGripDraft.checked=true;start('reading-handling');};motionControls.append(readingHandlingButton);
const reverseBookButton=document.createElement('button');reverseBookButton.textContent='Change book destination';reverseBookButton.onclick=()=>{
 readingGripDraft.checked=true;
 if(motion!=='reading-handling'){handlingEvents=[[0,'rest']];start('reading-handling');return;}
 handlingEvents=handlingEvents.filter(([at])=>at<=motionTime);const target=handlingEvents.at(-1)?.[1]??'held';
 handlingEvents.push([motionTime,target==='held'?'rest':'held']);draw();
};motionControls.append(reverseBookButton);
for(const [id,label] of [['notifying','Gentle notification'],['urgent','Urgent attention'],['urgent-hold','Urgent hold'],['attention-flow','Attention and interrupt']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>start(id);motionControls.append(button);}
for(const [id,label] of [['awaiting_user','Awaiting you'],['awaiting_service','Awaiting service'],['awaiting_user-hold','Awaiting you hold'],['awaiting_service-hold','Awaiting service hold'],['waiting-flow','Waiting and interrupt']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>start(id);motionControls.append(button);}
for(const [id,label] of [['succeeded','Quiet completion'],['blocked','Blocked motion'],['blocked-hold','Blocked hold'],['gesture-flow','Interrupt gestures'],['working-flow','Working and listening'],['greeting-rest','Greeting to idle'],['idle-hold','Idle hold'],['searching-hold','Searching hold'],['search-flow','Search and interrupt']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>start(id);motionControls.append(button);}
motionToggle.textContent='Play motion';motionToggle.onclick=()=>{if(!motion){start('greeting');return;}if(motionTime>=durations[motion])motionTime=0;playing=!playing&&!reduced.matches;last=performance.now();draw()};
timeline.oninput=()=>{motion??='greeting';playing=false;motionTime=Number(timeline.value);authored.checked=true;draw()};motionControls.append(motionToggle,timeline);presets.after(motionControls);
globalThis.foxAnatomyStudio={draw:rig.draw,layers:rig.layers,canvas,sample(id,ms){motion=id;motionTime=ms;playing=false;authored.checked=true;draw();return {...(id.startsWith('drafting-')?draftingFrame(id,ms,reduced.matches):motionFrame(id,ms,reduced.matches)),pose,frontPaws}}};select();document.body.dataset.ready='true';
function tick(now){const delta=Math.max(0,now-last);last=Math.max(last,now);if(playing&&!document.hidden){motionTime=Math.min(durations[motion],motionTime+delta);if(motionTime===durations[motion])playing=false;draw()}raf=requestAnimationFrame(tick)}raf=requestAnimationFrame(tick);
document.addEventListener('visibilitychange',()=>{last=performance.now()});reduced.addEventListener('change',()=>{if(reduced.matches)playing=false;draw()});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);rig.dispose()},{once:true});
`},bundle:true,write:false,format:'esm'});
await mkdir('output/companion',{recursive:true});
await writeFile('output/companion/anatomy-studio.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fox · Anatomy registration</title><style>
*{box-sizing:border-box}body{margin:0;background:#eeeade;color:#344b40;font:15px system-ui}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:25px}p{line-height:1.5}section{display:grid;grid-template-columns:1fr 300px;gap:24px}#stage{min-height:560px;display:grid;place-items:center;background:#dad8cb;border-radius:24px;overflow:hidden}#stage.dark{background:#25372f}canvas{width:100%;max-width:560px;height:auto}canvas.hud{width:144px}aside{display:flex;flex-direction:column;gap:15px}label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}select,button{border:1px solid #89998466;background:#fff6;border-radius:12px;padding:9px;color:inherit;font:inherit}select,input[type=range]{max-width:100%}#status{font-size:12px}small{line-height:1.5;color:#657163}@media(max-width:700px){main{padding:12px}section{grid-template-columns:1fr}#stage{min-height:340px}canvas{max-width:380px}}</style>
<main><h1>Fox · Anatomy registration</h1><p>Original pixels, independent joints. Registration draft — missing joint overlaps are visible here, not concealed by stretching.</p><section><div id="stage"><canvas width="1254" height="1254" aria-label="Layered Fox registration"></canvas></div><aside><label>Joint <select id="joint"></select></label><label>Rotation / closure <input id="angle" type="range" step=".1" value="0"><output>0°</output></label><button id="reset">Reset all joints</button><label>Layer <select id="part"></select></label><label><input id="isolate" type="checkbox">Isolate layer</label><label><input id="anchors" type="checkbox">Show joint hierarchy</label><label>Explode <input id="explode" type="range" min="0" max=".6" step=".01" value="0"></label><label><input id="reference" type="checkbox">Original reference</label><label><input id="hud" type="checkbox">144px HUD size</label><label><input id="dark" type="checkbox">Dark background</label><p id="status" role="status"></p><small>Independent painted eyelids and continuous three-joint tail skin are connected. Hidden-surface overlap painting remains unfinished. This inspector is not a finished animation or a live replacement.</small></aside></section></main><script>globalThis.source=${JSON.stringify(source)};globalThis.eyes=${JSON.stringify(eyes)}</script><script type="module">${result.outputFiles[0].text}</script></html>`);
console.log('output/companion/anatomy-studio.html');
