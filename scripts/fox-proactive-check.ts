// Fox speaks first (owner request 2026-10-06, modelled on Poke): Core's limits on when Worldlet asks
// Fox for a line, how a line nobody answered slows the next one, how "be quiet" holds them, how
// Fox's PASS hides the answer, and that Fox's voice rides with every turn. No model, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FOX_VOICE,PLACE,PROACTIVE,companionPrompt,onScreenText,proactiveAsked,proactiveCard,proactiveDue,proactiveHeard,proactiveLate,proactiveLine,proactiveQuietRequest,proactiveSpoke,proactiveState,proactiveTask,proactiveToolAllowed} from '../core/companion/index.ts';

const day='2026-10-06',t0=1_800_000_000;
const policyIncludes=(action:string)=>JSON.parse(fs.readFileSync('contracts/world-event-policy.json','utf8')).plumbing.includes(action);
const ask=(state:ReturnType<typeof proactiveState>,now:number,place='Games',moment:'settled'|'long-stay'|'late'|'checkin'='settled')=>proactiveDue(state,{now,day,moment,place});

// A fresh day may ask; asking (even when Fox passes) starts the gap.
let state=proactiveState();
assert.deepEqual(ask(state,t0),{due:true});
proactiveAsked(state,{now:t0,day,moment:'settled'});
assert.deepEqual(ask(state,t0+60),{due:false,reason:'gap'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds),{due:true});

// A shown line no longer waits for an answer (owner 2026-10-13 「companion说的再勤一点」): the gap alone spaces lines;
// answered in time, the next one keeps the normal gap.
assert(PROACTIVE.minGapSeconds<=5*60&&PROACTIVE.perDay>=30,'Fox speaks every few minutes, dozens of times a day');
proactiveSpoke(state,{now:t0+PROACTIVE.minGapSeconds,day,place:'Games',line:'Nice run.'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds+60,'Mail'),{due:false,reason:'gap'});
assert.equal(proactiveHeard(state,{now:t0+PROACTIVE.minGapSeconds+120,text:'haha thanks'}),false);
assert.equal(state.ignored,0);
assert.deepEqual(ask(state,t0+2*PROACTIVE.minGapSeconds,'Mail'),{due:true});

// Lines let pass double the gap, at most twice.
state=proactiveState();
let now=t0;
for(let i=0;i<4;i++){proactiveAsked(state,{now,day,moment:'settled'});proactiveSpoke(state,{now,day,place:'p'+i,line:'line '+i});now+=PROACTIVE.answeredSeconds+1;ask(state,now,'x');now+=PROACTIVE.minGapSeconds*8;}
assert.equal(state.ignored,3);
const last=state.lastAt;
assert.deepEqual(ask(state,last+PROACTIVE.minGapSeconds*2-1,'y'),{due:false,reason:'gap'});
assert.deepEqual(ask(state,last+PROACTIVE.minGapSeconds*2,'y'),{due:true});
assert.deepEqual(state.recent,['line 0','line 1','line 2','line 3']);
// Check in (owner 2026-10-13 「隔一段时间就表达一下」): asked only once Fox has said nothing on its own, a browse line
// included, for `checkinSeconds`; then it may speak in the World or anywhere else.
state=proactiveState();
assert.deepEqual(ask(state,t0,'World','checkin'),{due:true});
proactiveAsked(state,{now:t0,day,moment:'checkin'});
assert.deepEqual(ask(state,t0+PROACTIVE.minGapSeconds,'World','checkin'),{due:false,reason:'gap'});
assert.deepEqual(ask(state,t0+PROACTIVE.checkinSeconds,'World','checkin'),{due:true});
state.browseAt=t0+PROACTIVE.checkinSeconds-60;
assert.deepEqual(ask(state,t0+PROACTIVE.checkinSeconds,'World','checkin'),{due:false,reason:'gap'},'a browse line just now counts as Fox talking');
const checkinTask=proactiveTask({moment:'checkin',place:'World',local:'Mon 15:10',minutes:12,recent:[],lastWords:''});
for(const part of ['have not said anything for a while','presence','rates 4 or more','PASS','read only'])assert(checkinTask.includes(part),part);
const proactivePage=fs.readFileSync('ui/companion/fox-proactive.ts','utf8');
assert.match(proactivePage,/if\(\(now-checkedAt\)\/1000>=60\)\{checkedAt=now;void ask\('checkin',key\);\}/);
// Fox's own last line no longer holds the next one; a question, notice or card still does.
assert.match(fs.readFileSync('ui/companion/native-chat.ts','utf8'),/!!guideShown&&!spokeFirstLine\(guideShown\)\|\|guideHere\(guide\)&&!spokeFirstLine\(guide\)/);

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

// Browse with me (owner request 2026-10-08): in an Applet or page Fox may say a line about the screen, asked a few
// times per visit, on its own clock (45 seconds, doubling when let pass, at most four times) apart from the other
// moments' limits (owner 2026-10-10 「让它提供的更勤一点」, 2026-10-12 「进一个 applet 就开始推荐说话」).
const browse=(state:ReturnType<typeof proactiveState>,now:number,visit:string,place='Mail')=>proactiveDue(state,{now,day,moment:'browsing',place,visit});
state=proactiveState();
assert(PROACTIVE.browse.settleSeconds<=5,'the opening line is asked a few seconds after the Applet opens');
assert.deepEqual(browse(state,t0,''),{due:false,reason:'visit'},'a browse ask names its visit');
assert.deepEqual(browse(state,t0,'mail@1'),{due:true});
proactiveAsked(state,{now:t0,day,moment:'browsing',visit:'mail@1'});
let at=t0;
for(let i=1;i<PROACTIVE.browse.perVisit;i++){at+=PROACTIVE.browse.againSeconds;assert.deepEqual(browse(state,at,'mail@1'),{due:true},'another look in the same visit');proactiveAsked(state,{now:at,day,moment:'browsing',visit:'mail@1'});}
assert.deepEqual(browse(state,t0+3600,'mail@1'),{due:false,reason:'visit'},'a few asks per visit at most');
state.browseAt=t0;
assert.deepEqual(browse(state,t0+10,'x@2','X'),{due:false,reason:'gap'});
assert.deepEqual(browse(state,t0+PROACTIVE.browse.gapSeconds,'x@2','X'),{due:true});
// A browse ask leaves the other moments' clock alone, and its lines do not use up their per-place or per-day counts.
assert.equal(state.lastAt,0);assert.deepEqual(ask(state,t0+60),{due:true});
proactiveSpoke(state,{now:t0+PROACTIVE.browse.gapSeconds,day,place:'X',line:'That thread is from your landlord.',moment:'browsing'});
assert.equal(state.spoken,0);assert.equal(state.browsed,1);assert.deepEqual(state.places,{});
// A browse line does not wait for the last line's answer (one unanswered line held every Applet quiet for 10 minutes).
now=t0+2*PROACTIVE.browse.gapSeconds;
assert.deepEqual(browse(state,now,'y@3','Y'),{due:true},'the next Applet opens with its own line');
// Back in the same Applet soon after Fox spoke there: no opening line again until a while has passed.
assert.deepEqual(browse(state,now,'x@9','X'),{due:false,reason:'place'});
assert.deepEqual(browse(state,t0+PROACTIVE.browse.gapSeconds+PROACTIVE.browse.placeSeconds,'x@9','X'),{due:true});
// Let pass (a new line over an unanswered one, or no answer in time), the next browse lines wait longer, at most ×4.
proactiveAsked(state,{now,day,moment:'browsing',visit:'y@3'});proactiveSpoke(state,{now,day,place:'Y',line:'Two',moment:'browsing'});
assert.equal(state.ignored,1);
assert.deepEqual(browse(state,now+2*PROACTIVE.browse.gapSeconds-1,'w@4','W'),{due:false,reason:'gap'});
assert.deepEqual(browse(state,now+2*PROACTIVE.browse.gapSeconds,'w@4','W'),{due:true});
state.ignored=3;
assert.deepEqual(browse(state,now+4*PROACTIVE.browse.gapSeconds,'w@4','W'),{due:true},'browsing slows at most four times');
// Answering resets it.
proactiveHeard(state,{now:now+30,text:'yes, open it'});assert.equal(state.ignored,0);
// The day's browse lines run out on their own count.
state=proactiveState();
for(let i=0;i<PROACTIVE.browse.perDay;i++)proactiveSpoke(state,{now:t0,day,place:'p',line:String(i),moment:'browsing'});
state.pending=null;state.ignored=0;
assert.deepEqual(browse(state,t0+PROACTIVE.browse.gapSeconds,'z@1'),{due:false,reason:'day'});
assert.deepEqual(proactiveDue(state,{now:t0+PROACTIVE.browse.gapSeconds,day:'2026-10-07',moment:'browsing',place:'p',visit:'z@1'}),{due:true});
// No switch turns Fox off (owner 2026-10-13 「他就该说话就说话」); "be quiet" still holds browsing too.
state=proactiveState();
assert(!('browse' in state),'no Browse with me | Don\'t bother state');
proactiveHeard(state,{now:t0,text:'别打扰我'});
assert.deepEqual(browse(state,t0+60,'v'),{due:false,reason:'quiet'});
// The browse ask asks for context about the screen, still read only with PASS.
const browseTask=proactiveTask({moment:'browsing',place:'Mail',local:'Thu 11:40',minutes:1,recent:[],lastWords:''});
for(const part of ['looking at Mail','context','PASS','read only'])assert(browseTask.includes(part),part);
// The ask made as the Applet opens asks for one concrete recommendation about it, with the lowest bar.
const openTask=proactiveTask({moment:'browsing',place:'Mail',local:'Thu 11:40',minutes:0,recent:[],lastWords:'',opened:true});
for(const part of ['just opened Mail','one concrete recommendation','rates 3 or more','PASS','read only'])assert(openTask.includes(part),part);
assert(!browseTask.includes('just opened')&&!proactiveTask({moment:'settled',place:'Mail',local:'Thu 11:40',minutes:2,recent:[],lastWords:'',opened:true}).includes('just opened'),'only the opening browse ask');
assert(!proactiveTask({moment:'settled',place:'Mail',local:'Thu 11:40',minutes:2,recent:[],lastWords:''}).includes('Browsing along'),'only the browse ask adds the context reason');
// In a game Worldlet follows, Fox plays along (owner 2026-10-13 「边玩也边给用户这个建议」): browse looks keep coming all visit,
// a tip for the turn while a battle is on, a chat about the session when they come in, all with the lowest bar.
state=proactiveState();
for(let i=0;i<PROACTIVE.browse.perVisit;i++){assert.deepEqual(proactiveDue(state,{now:t0+i*PROACTIVE.browse.game.againSeconds,day,moment:'browsing',place:'Showdown',visit:'g@1',game:true}),{due:true},'look '+i);proactiveAsked(state,{now:t0+i*PROACTIVE.browse.game.againSeconds,day,moment:'browsing',visit:'g@1'});}
const later=t0+PROACTIVE.browse.perVisit*PROACTIVE.browse.game.againSeconds;
assert.deepEqual(proactiveDue(state,{now:later,day,moment:'browsing',place:'Showdown',visit:'g@1'}),{due:false,reason:'visit'},'an ordinary Applet stops after a few looks');
assert.deepEqual(proactiveDue(state,{now:later,day,moment:'browsing',place:'Showdown',visit:'g@1',game:true}),{due:true},'a game keeps going');
assert(PROACTIVE.browse.game.perVisit>=20&&PROACTIVE.browse.game.againSeconds<=60&&PROACTIVE.browse.game.gapSeconds<PROACTIVE.browse.game.againSeconds);
const battleTip=proactiveTask({moment:'browsing',place:'Showdown',local:'Mon 20:10',minutes:6,recent:[],lastWords:'',game:{playing:{format:'[Gen 9] VGC 2026 Reg I',opponent:'Cynthia77',turn:4},record:{won:1,lost:2,tied:0}}});
for(const part of ['in a battle right now','vs Cynthia77, turn 4','1 won, 2 lost today','one concrete tip for this turn','rates 3 or more'])assert(battleTip.includes(part),part);
const gameOpen=proactiveTask({moment:'browsing',place:'Showdown',local:'Mon 20:10',minutes:0,recent:[],lastWords:'',opened:true,game:{playing:null,record:{won:0,lost:0,tied:0}}});
assert(gameOpen.includes('joining their session')&&!gameOpen.includes('They just walked in'),'a game opens with a chat, not a screen recommendation');

// No Browse with me | Don't bother switch anywhere: the host forgets the old choice and has no foxBrowse action, Fox's
// card carries no switch. The host tells the page when the place is a game, which then keeps the game's pace.
const hostSource=fs.readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
assert(!/foxBrowse:|proactiveBrowse|preferences\.bool\('worldlet\.foxBrowse'/.test(hostSource));
assert.match(hostSource,/preferences\.remove\('worldlet\.foxBrowse'\)/);
assert.match(hostSource,/game=browser\(\)\?\.gameNow\?\.\(\)\?\?null/);
assert.match(hostSource,/return \{started:true,id,\.\.\.game\?\{game:true\}:\{\}\};/);
assert.match(hostSource,/page\.event\('worldlet:fox-proactive',\{id:run\.id,line,thread,moment,\.\.\.card\?\{card\}:\{\}\}\)/);
const chat=fs.readFileSync('ui/companion/native-chat.ts','utf8');
assert(!/Browse with me|Don’t bother|browseSwitch|foxBrowse/.test(chat),'no switch in Fox\'s card');
const pageSource=fs.readFileSync('ui/companion/fox-proactive.ts','utf8');
assert.match(pageSource,/if\(result\?\.game===true&&key===place\)game=true;/);
assert.match(pageSource,/const pace=game\?PROACTIVE\.browse\.game:PROACTIVE\.browse;/);
assert.match(pageSource,/const due=looks===0\?\(openedByPerson\?here>=PROACTIVE\.browse\.settleSeconds:here>=PROACTIVE\.browse\.againSeconds\):looks<pace\.perVisit&&\(now-lookedAt\)\/1000>=pace\.againSeconds;/);
// Only a place the person opened themselves gets the opening line; one Fox or the first run brought them to (the end of
// the tour leaves them on Fox's page, onboarding-flow.ts) waits for the later look.
assert.match(pageSource,/openedByPerson=since-activeAt<10_000;/);
assert.match(pageSource,/if\(due&&quiet>=2\)\{settled=true;looks\+\+;lookedAt=now;void ask\('browsing',key\);return;\}/);
assert.match(pageSource,/\{visit,opened:looks===1&&openedByPerson\}/);
assert.match(pageSource,/setInterval\(tick,2000\)/);
assert.match(hostSource,/opened:moment==='browsing'&&request\.opened===true/);
// A line Fox said first arrives with its own effect in the card, never on a reply.
assert.match(chat,/const spokeFirst=guided&&spokeFirstLine\(shownGuide\)\?shownGuide:null;panel\.dataset\.proactive=String\(!!spokeFirst\);/);
assert.match(chat,/const spokeFirstLine=\(value:any\)=>String\(value\?\.source\|\|''\)\.startsWith\('proactive:'\);/);
assert.match(chat,/arriveProactive\(panel,log,reducedMotion\.matches\)/);
assert(fs.readFileSync('scripts/build-ui.ts','utf8').includes("'ui/companion/fox-proactive.css'"),'the effect styles ship');
// The ask sees what the place shows, as the person's own turn would (a native Applet has no page text).
assert.match(pageSource,/environment:context/);
assert.match(chat,/environment:\(\)=>\(\{key:context\.key,location:context\.title,state:context\.detail,/);
assert.match(hostSource,/const context:Row=\{\.\.\.environment,history:recentHistory\(\),proactive:\{moment\}\};/);
assert(browseTask.includes('rates 4 or more')&&proactiveTask({moment:'settled',place:'Mail',local:'Thu 11:40',minutes:2,recent:[],lastWords:''}).includes('rates 6 or more'),'the bar is lower while browsing');
assert(!policyIncludes('foxBrowse'),'no switch action');

// Fox's answer: PASS shows nothing; a line is one line, unquoted and clipped.
for(const message of ['PASS','pass.','  PASS  ','"PASS"','',null])assert.equal(proactiveLine(message),null,String(message));
assert.equal(proactiveLine('“连赢三局，手感不错。”'),'连赢三局，手感不错。');
assert.equal(proactiveLine('That Thursday call clashes with your dentist.\nWant me to move it?'),'That Thursday call clashes with your dentist.');
assert.equal([...proactiveLine('长'.repeat(400))!].length,PROACTIVE.lineCharacters);
// An Agent's own error is not Fox's line (owner Order 2026-10-10: Hermes' Codex rejection showed in the browse card).
for(const message of ["ChatGPT or Codex Subscription rejected the request and retrying won't help. Pick another model with /model, or check the details in ~/.hermes/logs/agent.log.",
 '❌ Non-retryable error (HTTP 400): context too long','⚠️ API call failed after 3 retries: timeout','⏱️ The model provider is rate-limiting requests. Please wait a moment and try again.'])assert.equal(proactiveLine(message),null,message);
assert.equal(proactiveLine('The API call failed twice in this thread; want me to look?'),'The API call failed twice in this thread; want me to look?');
// A line about something waiting on the person points to its Attention card (owner decision 2026-10-10): the mark names
// the item and never shows in the line; a line without one points nowhere, and PASS stays PASS.
assert.match(proactiveTask({moment:'settled',place:'World',local:'Fri 15:00',minutes:2,recent:[],lastWords:''}),/end it with \[card:ID\], that item's exact id/);
assert.equal(proactiveLine('Priya still needs the venue answer by Friday. [card:venue-reply]'),'Priya still needs the venue answer by Friday.');
assert.equal(proactiveCard('Priya still needs the venue answer by Friday. [card:venue-reply]'),'venue-reply');
assert.equal(proactiveLine('“周五前要回 Priya 场地的事。” [card: venue-reply ]'),'周五前要回 Priya 场地的事。');
assert.equal(proactiveCard('“周五前要回 Priya 场地的事。” [card: venue-reply ]'),'venue-reply');
assert.equal(proactiveLine('Nice run.\n[card:x]'),'Nice run.');
assert.equal(proactiveCard('Nice run.'),null);
assert.equal(proactiveLine('PASS [card:venue-reply]'),null);
assert.equal(proactiveLine('[card:venue-reply]'),null);
// The host keeps the id only while that item is open in the World, and the page offers its card.
const foxHost=fs.readFileSync('platform/electron/src/modules/fox/index.ts','utf8');
assert.match(foxHost,/card=line\?openItem\(proactiveCard\(result\.message\)\):''/);
assert.match(foxHost,/item\.id===id&&\(item\.status\?\?'open'\)==='open'/);

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
// No speak-first ask while a tour step shows.
assert.match(fs.readFileSync('ui/companion/native-chat.ts','utf8'),/root\.dataset\.onboardingLocked==='true'\|\|!!root\.dataset\.tourStep\?'':segmentNow\(\)/);
console.log('fox proactive check passed');
