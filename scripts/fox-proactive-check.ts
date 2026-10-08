// Fox speaks first (owner request 2026-10-06, modelled on Poke): Core's limits on when Worldlet asks
// Fox for a line, how a line nobody answered slows the next one, how "be quiet" holds them, how
// Fox's PASS hides the answer, and that Fox's voice rides with every turn. No model, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FOX_VOICE,PLACE,PROACTIVE,companionPrompt,onScreenText,proactiveAsked,proactiveDue,proactiveHeard,proactiveLate,proactiveLine,proactiveQuietRequest,proactiveSpoke,proactiveState,proactiveTask,proactiveToolAllowed} from '../core/companion/index.ts';

const day='2026-10-06',t0=1_800_000_000;
const policyIncludes=(action:string)=>JSON.parse(fs.readFileSync('contracts/world-event-policy.json','utf8')).plumbing.includes(action);
const ask=(state:ReturnType<typeof proactiveState>,now:number,place='Games',moment:'settled'|'long-stay'|'late'='settled')=>proactiveDue(state,{now,day,moment,place});

// A fresh day may ask; asking (even when Fox passes) starts the gap.
let state=proactiveState();
assert.deepEqual(ask(state,t0),{due:true});
proactiveAsked(state,{now:t0,day,moment:'settled'});
assert.deepEqual(ask(state,t0+60),{due:false,reason:'gap'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds),{due:true});

// A shown line waits for an answer; answered in time, the next one keeps the normal gap.
proactiveSpoke(state,{now:t0+PROACTIVE.minGapSeconds,day,place:'Games',line:'Nice run.'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds+60,'Mail'),{due:false,reason:'waiting'});
assert.equal(proactiveHeard(state,{now:t0+PROACTIVE.minGapSeconds+120,text:'haha thanks'}),false);
assert.equal(state.ignored,0);
assert.deepEqual(ask(state,t0+2*PROACTIVE.minGapSeconds,'Mail'),{due:true});

// Lines let pass double the gap, up to eight times.
state=proactiveState();
let now=t0;
for(let i=0;i<4;i++){proactiveAsked(state,{now,day,moment:'settled'});proactiveSpoke(state,{now,day,place:'p'+i,line:'line '+i});now+=PROACTIVE.answeredSeconds+1;ask(state,now,'x');now+=PROACTIVE.minGapSeconds*8;}
assert.equal(state.ignored,3);
const last=state.lastAt;
assert.deepEqual(ask(state,last+PROACTIVE.minGapSeconds*7,'y'),{due:false,reason:'gap'});
assert.deepEqual(ask(state,last+PROACTIVE.minGapSeconds*8,'y'),{due:true});
assert.deepEqual(state.recent,['line 0','line 1','line 2','line 3']);

// Per place and per day limits; a new day starts over.
state=proactiveState();now=t0;
for(let i=0;i<PROACTIVE.perPlace;i++){proactiveSpoke(state,{now,day,place:'Games',line:String(i)});proactiveHeard(state,{now:now+1,text:'ok'});now+=PROACTIVE.minGapSeconds;}
assert.deepEqual(ask(state,now,'Games'),{due:false,reason:'place'});
for(let i=state.spoken;i<PROACTIVE.perDay;i++){proactiveSpoke(state,{now,day,place:'p'+i,line:String(i)});proactiveHeard(state,{now:now+1,text:'ok'});now+=PROACTIVE.minGapSeconds;}
assert.deepEqual(ask(state,now,'Elsewhere'),{due:false,reason:'day'});
assert.deepEqual(proactiveDue(state,{now,day:'2026-10-07',moment:'settled',place:'Games'}),{due:true});

// Late at night is asked once a day.
state=proactiveState();
proactiveAsked(state,{now:t0,day,moment:'late'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds,'Games','late'),{due:false,reason:'once'});
assert.equal(proactiveLate(23),true);assert.equal(proactiveLate(2),true);assert.equal(proactiveLate(12),false);

// "Be quiet" holds every line for a while; a longer message that mentions quiet does not.
for(const text of ['别说话','安静点','闭嘴','不要打扰','be quiet','Shut up','stop talking'])assert.equal(proactiveQuietRequest(text),true,text);
for(const text of ['帮我找一个安静的咖啡馆，下午想去写东西','what is a quiet place to read nearby?','你好'])assert.equal(proactiveQuietRequest(text),false,text);
state=proactiveState();
assert.equal(proactiveHeard(state,{now:t0,text:'安静点'}),true);
assert.deepEqual(ask(state,t0+3600),{due:false,reason:'quiet'});
assert.deepEqual(ask(state,t0+PROACTIVE.quietSeconds+PROACTIVE.minGapSeconds),{due:true});

// Browse with me (owner request 2026-10-08): in an Applet or page Fox may say one line per visit after a short
// look, on its own clock (4 minutes, doubling when let pass, 20 a day) apart from the other moments' limits.
const browse=(state:ReturnType<typeof proactiveState>,now:number,visit:string,place='Mail')=>proactiveDue(state,{now,day,moment:'browsing',place,visit});
state=proactiveState();
assert.equal(state.browse,true,'on unless the person chose Don\'t bother');
assert.deepEqual(browse(state,t0,''),{due:false,reason:'visit'},'a browse ask names its visit');
assert.deepEqual(browse(state,t0,'mail@1'),{due:true});
proactiveAsked(state,{now:t0,day,moment:'browsing',visit:'mail@1'});
assert.deepEqual(browse(state,t0+3600,'mail@1'),{due:false,reason:'visit'},'one line per visit');
assert.deepEqual(browse(state,t0+60,'x@2','X'),{due:false,reason:'gap'});
assert.deepEqual(browse(state,t0+PROACTIVE.browse.gapSeconds,'x@2','X'),{due:true});
// A browse ask leaves the other moments' clock alone, and its lines do not use up their per-place or per-day counts.
assert.equal(state.lastAt,0);assert.deepEqual(ask(state,t0+60),{due:true});
proactiveSpoke(state,{now:t0+PROACTIVE.browse.gapSeconds,day,place:'X',line:'That thread is from your landlord.',moment:'browsing'});
assert.equal(state.spoken,0);assert.equal(state.browsed,1);assert.deepEqual(state.places,{});
assert.deepEqual(browse(state,t0+2*PROACTIVE.browse.gapSeconds,'y@3','Y'),{due:false,reason:'waiting'},'a line waits for its answer');
// Let pass, the next browse lines wait longer: twice, then four times the gap.
now=t0+PROACTIVE.browse.gapSeconds+PROACTIVE.answeredSeconds+1;
assert.deepEqual(browse(state,now,'y@3','Y'),{due:true});
assert.equal(state.ignored,1);
proactiveAsked(state,{now,day,moment:'browsing',visit:'y@3'});proactiveSpoke(state,{now,day,place:'Y',line:'Two',moment:'browsing'});
now+=PROACTIVE.answeredSeconds+1;
assert.deepEqual(browse(state,now,'w@4','W'),{due:false,reason:'gap'});
assert.equal(state.ignored,2);
assert.deepEqual(browse(state,now-PROACTIVE.answeredSeconds-1+4*PROACTIVE.browse.gapSeconds,'w@4','W'),{due:true});
// The day's browse lines run out on their own count.
state=proactiveState();
for(let i=0;i<PROACTIVE.browse.perDay;i++)proactiveSpoke(state,{now:t0,day,place:'p',line:String(i),moment:'browsing'});
state.pending=null;
assert.deepEqual(browse(state,t0+PROACTIVE.browse.gapSeconds,'z@1'),{due:false,reason:'day'});
assert.deepEqual(proactiveDue(state,{now:t0+PROACTIVE.browse.gapSeconds,day:'2026-10-07',moment:'browsing',place:'p',visit:'z@1'}),{due:true});
// Don't bother: Fox never speaks first, for any moment, until Browse with me is chosen again; "be quiet" holds browsing too.
state=proactiveState();state.browse=false;
for(const moment of ['settled','long-stay','late','browsing'] as const)assert.deepEqual(proactiveDue(state,{now:t0,day,moment,place:'Mail',visit:'v'}),{due:false,reason:'off'},moment);
state.browse=true;proactiveHeard(state,{now:t0,text:'别打扰我'});
assert.deepEqual(browse(state,t0+60,'v'),{due:false,reason:'quiet'});
// The browse ask asks for context about the screen, still read only with PASS.
const browseTask=proactiveTask({moment:'browsing',place:'Mail',local:'Thu 11:40',minutes:1,recent:[],lastWords:''});
for(const part of ['looking at Mail','context','PASS','read only'])assert(browseTask.includes(part),part);
assert(!proactiveTask({moment:'settled',place:'Mail',local:'Thu 11:40',minutes:2,recent:[],lastWords:''}).includes('Browsing along'),'only the browse ask adds the context reason');

// The switch: the host keeps the choice (on by default), refuses every ask while off and cancels one running; the
// page shows Browse with me | Don't bother in Fox's card on browse lines and, while off, on every card in an Applet,
// never in the World, onboarding or on the desktop; asks in an Applet are browse asks once per visit.
const hostSource=fs.readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
assert.match(hostSource,/proactive\.browse=preferences\.bool\('worldlet\.foxBrowse',true\)/);
assert.match(hostSource,/foxBrowse:request=>proactiveBrowse\(request\)/);
assert.match(hostSource,/preferences\.set\('worldlet\.foxBrowse',false\);proactiveCancel\(\);/);
assert.match(hostSource,/page\.event\('worldlet:fox-proactive',\{id:run\.id,line,thread,moment\}\)/);
const chat=fs.readFileSync('ui/companion/native-chat.ts','utf8');
assert.match(chat,/make\('button','','Browse with me'\),browseOff=make\('button','','Don’t bother'\)/);
assert.match(chat,/browseSwitch\.hidden=browsing===null\|\|onDesktop\(\)\|\|root\.dataset\.onboarding==='true'\|\|root\.dataset\.onboardingLocked==='true'\|\|\(context\.key\.split\(':'\)\[0\]==='overview'&&!contentIdentity\(\)\)\|\|!\(browsing===false\|\|guided&&shownGuide\.browsing===true\)/);
const pageSource=fs.readFileSync('ui/companion/fox-proactive.ts','utf8');
assert.match(pageSource,/if\(!settled&&!world\(\)&&here>=PROACTIVE\.browse\.settleSeconds&&quiet>=5\)\{settled=true;void ask\('browsing',key\);return;\}/);
assert(policyIncludes('foxBrowse'),'the switch is plumbing, never World history');

// Fox's answer: PASS shows nothing; a line is one line, unquoted and clipped.
for(const message of ['PASS','pass.','  PASS  ','"PASS"','',null])assert.equal(proactiveLine(message),null,String(message));
assert.equal(proactiveLine('“连赢三局，手感不错。”'),'连赢三局，手感不错。');
assert.equal(proactiveLine('That Thursday call clashes with your dentist.\nWant me to move it?'),'That Thursday call clashes with your dentist.');
assert.equal([...proactiveLine('长'.repeat(400))!].length,PROACTIVE.lineCharacters);

// The ask names the moment, the lines already said and the person's words, and is read only with PASS.
const task=proactiveTask({moment:'long-stay',place:'Games · 2048',local:'Tue 23:10',minutes:47,recent:['Nice run.'],lastWords:'再来一局'});
for(const part of ['about 47 minutes','PASS','read only','"Nice run."','"再来一局"','Not the person\'s words'])assert(task.includes(part),part);
// It runs only the reads the host serves (Hermes authorizes each first); every other tool is refused to the model,
// never failing the ask (Mac RC c0369d5d), and it never asks for a page tool the World page cannot run for it.
for(const event of [{name:'query_world_items',args:{}},{name:'_world_authorize',args:{name:'query_world_items'}},{name:'_world_authorize',args:{name:'read_world_history'}}])assert(proactiveToolAllowed(event),JSON.stringify(event));
for(const event of [{name:'automate_browser',args:{operation:'snapshot'}},{name:'_world_authorize',args:{name:'read_world_source'}},{name:'_world_authorize',args:{name:'manage_routines'}},{name:'update_world_item',args:{}},{name:'_world_authorize'},{name:'_world_authorize',args:['query_world_items']}])assert(!proactiveToolAllowed(event),JSON.stringify(event));
assert(!task.includes('browser/snapshot'));

// The page on screen rides along as its recorded text (owner Order 2026-10-07: on a 小红书 post every ask
// passed, as it got only the title and reading the page was refused): the newest whole-page text and what
// was added after it, never an older page's text.
assert(task.includes('page.text'),'the ask points at the page text');
assert.equal(onScreenText([{kind:'text',body:'Old page'},{kind:'page',body:''},{kind:'text',body:'Feed  of\nnotes'},{kind:'click',body:'x'},{kind:'text-more',body:'贾国龙咽不下这口气'}]),'Feed of notes\n贾国龙咽不下这口气');
assert.equal(onScreenText([{kind:'text-more',body:'Only new'}]),'Only new');
assert.equal(onScreenText([]),'');
// A long page keeps its start and its newest part, within the bound.
const long=onScreenText([{kind:'text',body:'HEAD '+'a'.repeat(9000)},{kind:'text-more',body:'NEWEST POST'}]);
assert(long.startsWith('HEAD')&&long.endsWith('NEWEST POST')&&[...long].length<=PLACE.pageCharacters,long.length+'');
// The host puts it in the ask's context, and Hermes forwards it within the same bound.
const fox=fs.readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
assert.match(fox,/context\.page=\{site:visit\.site,title:visit\.title,text:pageText\}/);
const hermes=fs.readFileSync('harness/hermes/world_context.py','utf8');
assert.match(hermes,new RegExp('PAGE_TEXT = '+PLACE.pageCharacters));
assert.match(hermes,/out\["page"\]/);

// Fox's voice rides with every Fox turn, whatever its personality, and is Worldlet's own text.
const prompt=companionPrompt({format:'worldlet.companion',version:1,identity:{id:'fixture',name:'Fox',createdAt:'2026-09-24T00:00:00Z'},personality:'Formal',memoryAuthority:'worldlet',memories:[],conversations:[]} as any);
assert(prompt.includes(FOX_VOICE));
for(const banned of ['How can I help','Let me know if you need anything else'])assert(FOX_VOICE.includes(banned),banned);
assert(!/\bPoke\b/.test(FOX_VOICE+fs.readFileSync('core/companion/fox-proactive.ts','utf8').replace(/modelled on Poke/,'')));

// The host asks through plumbing commands, so asks never fill the World's history.
const policy=JSON.parse(fs.readFileSync('contracts/world-event-policy.json','utf8'));
for(const action of ['foxProactive','foxProactiveShown'])assert(policy.plumbing.includes(action),action);
// The host never asks during onboarding or its tour, nor while the World is busy (Mac RC 2961: first
// value's pick timed out).
const host=fs.readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
assert.match(host,/if\(onboardingUnfinished\(store\.state\.onboarding\)\)return \{started:false,reason:'onboarding'\}/);
assert.match(host,/store\.busy\|\|store\.organizing\)return \{started:false,reason:'busy'\}/);
// No speak-first ask while a tour step (the phone step after the first win) shows…
assert.match(fs.readFileSync('ui/companion/native-chat.ts','utf8'),/root\.dataset\.onboardingLocked==='true'\|\|!!root\.dataset\.tourStep\|\|!!root\.dataset\.tourCoda\?'':segmentNow\(\)/);
// …nor while the phone step is still to come after the first win (Mac RC 3035: its line kept the phone from showing).
assert.match(fs.readFileSync('ui/onboarding/world-tour.ts','utf8'),/root\.dataset\.tourCoda='waiting';/);
console.log('fox proactive check passed');
