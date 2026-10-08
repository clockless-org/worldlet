// Fox reviews games played in the built-in browser (#1598, owner promise to a VGC player in the
// 2026-10-03 recording: play about ten games, then Fox reviews the teams, the teams that beat them and
// each turn's choices). Three doubles battles as the Showdown web client exchanges them over its
// WebSocket (scripts/fixtures/showdown-battles.json, made with the official simulator) go through the
// host recorder into a World database; Fox's own reads (`browser/records`, `browser/record`) then find
// the session, list the games, and read each one, team preview to result, in at most two pages. Fox's
// guidance tells it to do exactly that and to answer as a coach. Once the person stops playing, Worldlet
// hands those games to Fox for a review without being asked (core/games/battle-review.ts). No browser,
// no model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {WebRecorder,readRecordings} from '../platform/electron/src/modules/browser/recorder.ts';
import {WEB_RECORD,webTranscript,type WebRecord} from '../core/browser/index.ts';
import {conversationGuidance} from '../core/companion/conversation-guidance.ts';
import {listWorldTools} from '../core/tools/index.ts';
import {BATTLE_REVIEW,battleReviewDue,battleWatch,battlesReviewed,finishedBattles,observeBattleMessage} from '../core/games/index.ts';
import {BattleReviews} from '../platform/electron/src/modules/browser/battle-review.ts';

type Frame={in?:string;out?:string};
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/showdown-battles.json',import.meta.url),'utf8')) as {games:{room:string;frames:Frame[]}[]};
assert.equal(fixture.games.length,3);
const winner=(game:{frames:Frame[]})=>game.frames.map(f=>f.in??'').join('\n').match(/^\|win\|(.+)$/m)?.[1];
const lastTurn=(game:{frames:Frame[]})=>Math.max(...[...game.frames.map(f=>f.in??'').join('\n').matchAll(/^\|turn\|(\d+)$/gm)].map(m=>Number(m[1])));
assert.deepEqual(fixture.games.map(winner),['Cynthia77','Ashfox','Cynthia77'],'the fixture holds a loss, a win and a loss');

// Offsets are record numbers, also in a filtered read ------------------------------------------------
{
 const visit={id:'v',site:'example.com',url:'https://example.com/',title:'Example',applet:'browser',startedAt:0,endedAt:60};
 const rows=[{index:7,at:0,kind:'ws-in',url:'',meta:{},body:'|turn|1'},{index:9,at:0,kind:'ws-in',url:'',meta:{},body:'|turn|2'}] as (WebRecord&{index:number})[];
 const read=webTranscript(visit,rows,{offset:5,after:3,limit:10_000});
 assert.match(read.text,/#7\][\s\S]*#9\]/,'a filtered read numbers each record by its place in the visit');
 assert.equal(read.nextOffset,10,'and continues after the last record it showed');
 assert.equal(webTranscript(visit,rows,{offset:5,after:2}).nextOffset,null,'nothing is left when it showed every match');
}

// One evening of Showdown, recorded ----------------------------------------------------------------
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-game-review-'));
const ledger=new WorldLedger(folder);
let clock=Date.parse('2026-10-04T19:00:00-07:00')/1000;
const proactive:{task:string;request:string;games:unknown[]}[]=[];
const reviews=new BattleReviews({now:()=>clock,day:()=>'2026-10-04',local:at=>new Date(at*1000).toISOString().slice(11,16),start:review=>{proactive.push(review);return 'started';}});
try{
 let url='https://play.pokemonshowdown.com/';
 const recorder=new WebRecorder({get url(){return url;},get title(){return url.includes('/battle-')?'Ashfox vs. Cynthia77 - Showdown!':'Showdown!';},cdp:async()=>({})},
  (visits,rows)=>{ledger.recordWeb(visits,rows);reviews.observe(visits,rows);},{applet:'app-pokemon-showdown',now:()=>clock});
 const go=(address:string)=>{url=address;recorder.observed({kind:'page',url,title:''});};
 const received=(text:string)=>recorder.event('Network.webSocketFrameReceived',{requestId:'s',response:{opcode:1,payloadData:text}});
 const sent=(text:string)=>recorder.event('Network.webSocketFrameSent',{requestId:'s',response:{opcode:1,payloadData:text}});
 go('https://play.pokemonshowdown.com/');
 recorder.event('Network.webSocketCreated',{requestId:'s',url:'wss://sim3.psim.us/showdown/websocket'});
 received('|challstr|4|'+'9f3c'.repeat(64));
 sent('|/trn Ashfox,0,'+'a1b2'.repeat(40));
 received('|updateuser| Ashfox|1|169|{"blockChallenges":false}');
 received('|formats|,1|S/V Singles'+'|[Gen 9] Random Battle,f'.repeat(300));
 for(const game of fixture.games){
  clock+=60;go('https://play.pokemonshowdown.com/'+game.room);
  sent('|/challenge cynthia77, gen9doublescustomgame');
  for(const frame of game.frames){clock+=12;if(frame.in!==undefined)received(frame.in);else sent(frame.out!);}
  clock+=5;go('https://play.pokemonshowdown.com/');
 }
 recorder.flush();
 const reads={ledger,onScreen:'',now:clock+600,offsetMinutes:-420};

 // Worldlet reviews them without being asked once the person stops playing (#1598) ---------------------
 assert.equal(reviews.check(),null,'not while the last result is fresh: they may queue again');
 clock+=BATTLE_REVIEW.quietSeconds;
 const handed=reviews.check();
 assert.equal(proactive.length,1,'one review for the session');
 assert.deepEqual(handed?.map(game=>[game.room,game.result,game.opponent,game.self,game.turns]),fixture.games.map(game=>[game.room,winner(game)==='Ashfox'?'won':'lost','Cynthia77','Ashfox',lastTurn(game)]),'the person’s three games, how each went');
 const review=proactive[0];
 assert.match(review.request,/^\(Not the person's words: Worldlet started this/,'Fox is told nobody asked');
 const session=readRecordings('records',{site:'pokemonshowdown.com'},reads).visits[0].id;
 assert.ok(review.task.includes(`visit ${session}`),'the review names the recorded visit');
 for(const game of fixture.games)assert.ok(review.task.includes(game.room),'and each game');
 assert.match(review.task,/3 games, 1 won, 2 lost/);
 assert.match(review.task,/only "network" until its \|win\| or \|tie\|/,'read the way the guidance reads a game');
 assert.match(review.task,/team building[\s\S]*lost to[\s\S]*turn choices/,'the three things the player asked for');
 assert.match(review.task,/Do not open or click anything/);
 clock+=3600;
 assert.equal(reviews.check(),null,'a game is reviewed once');
 reviews.stop();

 // “帮我复盘最近几局”: Fox finds the session by its site…
 const found=readRecordings('records',{site:'pokemonshowdown.com'},reads);
 assert.equal(found.total,1,'the evening is one visit');
 const visit=found.visits[0];
 assert.equal(visit.applet,'app-pokemon-showdown');
 assert.ok(visit.recorded['ws-in']>100&&visit.recorded['ws-out']>40,'every message both ways is kept: '+JSON.stringify(visit.recorded));
 // …and its first page lists the games.
 const first=readRecordings('record',{id:visit.id},reads);
 const games=[...first.text.matchAll(/^#(\d+) \S+ (https:\/\/play\.pokemonshowdown\.com\/battle-\S+)/gm)].map(m=>({start:Number(m[1]),url:m[2]}));
 assert.deepEqual(games.map(g=>g.url.split('/').pop()),fixture.games.map(g=>g.room),'the outline lists each game with its record number');
 assert.ok(!first.text.includes('a1b2a1b2'),'the sign-in signature never reads back');

 // Each game from its #, network only, until its result.
 for(const [i,game] of games.entries()){
  let offset=game.start,text='',pages=0;
  for(;;){
   const read=readRecordings('record',{id:visit.id,offset,only:'network'},reads);
   pages++;text+=read.text;
   if(/^\|win\|/m.test(read.text)||read.next_offset===undefined)break;
   offset=read.next_offset;
  }
  const win=/^\|win\|.*$/m.exec(text),own=text.slice(0,win?win.index+win[0].length:text.length),expected=fixture.games[i];
  assert.ok(pages<=2,`game ${i+1} reads in ${pages} pages`);
  assert.ok(own.length<30_000,`game ${i+1} up to its result is ${own.length} characters`);
  assert.ok(!own.includes(fixture.games[i+1]?.room??'\0'),'a game, up to its result, is its own messages only');
  // What a coach needs, all in what Fox read: both teams at preview, how many were brought, every turn,
  // each side's moves and their effect, the choices sent, the knockouts and the result.
  assert.equal((own.match(/^\|poke\|p1\|/gm)??[]).length,6,'the person’s six at team preview');
  assert.equal((own.match(/^\|poke\|p2\|/gm)??[]).length,6,'the opponent’s six at team preview');
  assert.match(own,/^\|teampreview\|4$/m,'bring four');
  for(let turn=1;turn<=lastTurn(expected);turn++)assert.match(own,new RegExp(`^\\|turn\\|${turn}$`,'m'),`turn ${turn}`);
  assert.match(own,/^\|move\|p1a: [^|]+\|[^|]+\|/m);assert.match(own,/^\|move\|p2[ab]: /m);
  assert.match(own,/^\|-(supereffective|resisted|immune)\|/m,'type effectiveness');
  assert.match(own,/^\|faint\|/m);
  assert.match(own,/WebSocket sent:\nbattle-\S+\|\/choose (move|switch|default)/,'the person’s own choices');
  assert.match(own,new RegExp(`^\\|win\\|${winner(expected)}$`,'m'),'the result');
  // The per-turn request JSON (the person's own sets) is shown once and then shortened.
  assert.match(own,/\|request\|\{"active".* \[\+\d+ characters\]\n/,'the first request shows the person’s moves');
  assert.match(own,/shaped like #\d+\]/,'repeated requests shorten');
 }
 // Results across games at a glance: query keeps only the records that say who won, from the start.
 const results=readRecordings('record',{id:visit.id,query:'|win|'},reads);
 assert.deepEqual([...results.text.matchAll(/^\|win\|(.+)$/gm)].map(m=>m[1]),fixture.games.map(winner),'one read of every result');
 // Reading one record whole still works from a filtered #.
 const request=games[0].start+[...fixture.games[0].frames].findIndex(f=>f.in?.includes('|request|{"teamPreview"'))+2;
 const whole=readRecordings('record',{id:visit.id,offset:request,only:'network',full:true},reads);
 assert.match(whole.text,/"teamPreview":true[\s\S]*"teraType"/,'full reads a set whole');
 assert.ok(whole.text.length<=WEB_RECORD.readLimit+200);
}finally{
 reviews.stop();ledger.close();fs.rmSync(folder,{recursive:true,force:true});
}

// An evening of VGC with one team (the real-model check's fixture, scripts/fixtures/showdown-session.json) --------
{
 const session=JSON.parse(fs.readFileSync(new URL('./fixtures/showdown-session.json',import.meta.url),'utf8')) as {games:{room:string;opponent:string;frames:Frame[]}[]};
 const watch=battleWatch();let at=0;
 observeBattleMessage(watch,{visit:'v',site:'play.pokemonshowdown.com',at,body:'|updateuser| Ashfox|1|169|{}'});
 for(const game of session.games)for(const frame of game.frames)if(frame.in!==undefined)observeBattleMessage(watch,{visit:'v',site:'play.pokemonshowdown.com',at:at+=12,body:frame.in});
 const games=finishedBattles(watch);
 assert.deepEqual(games.map(game=>[game.opponent,game.result]),session.games.map(game=>[game.opponent,winner(game)==='Ashfox'?'won':'lost']),'six games against six opponents');
 assert.deepEqual(games.map(game=>game.result).filter(result=>result==='won').length,2,'two won, four lost');
 const team=(game:{frames:Frame[]})=>[...game.frames.map(f=>f.in??'').join('\n').matchAll(/^\|poke\|p1\|([^,|]+)/gm)].map(m=>m[1]).join();
 assert.equal(new Set(session.games.map(team)).size,1,'the same six every game');
 assert.equal(new Set(session.games.map(game=>game.frames.find(f=>f.out?.includes('/choose team'))?.out?.split(' ')[2])).size,session.games.length,'a different four brought each game');
 assert.equal(battleReviewDue(watch,at+BATTLE_REVIEW.quietSeconds,'2026-10-04')?.length,6,'reviewed together once the evening is over');
}

// When a review is due -----------------------------------------------------------------------------------
{
 const room=(n:number)=>`battle-gen9vgc2026regi-${n}`;
 const day='2026-10-04';
 let at=1_000_000;
 const message=(watch:ReturnType<typeof battleWatch>,n:number,lines:string[])=>observeBattleMessage(watch,{visit:'v1',site:'play.pokemonshowdown.com',at,body:`>${room(n)}\n`+lines.join('\n')});
 const play=(watch:ReturnType<typeof battleWatch>,n:number,{winner='Ashfox',players=['Ashfox','Rival'+n],end=true}:{winner?:string;players?:string[];end?:boolean}={})=>{
  message(watch,n,['|init|battle','|title|x',`|player|p1|${players[0]}|`,`|player|p2|${players[1]}|`,'|tier|[Gen 9] VGC 2026 Reg I','|teampreview|4']);
  at+=60;message(watch,n,['|turn|1']);at+=300;
  if(end)message(watch,n,['|turn|7',`|win|${winner}`]);
 };
 const fresh=()=>{const watch=battleWatch();observeBattleMessage(watch,{visit:'v1',site:'play.pokemonshowdown.com',at,body:'|updateuser| Ashfox|1|169|{}'});return watch;};
 // Who the person is comes from the lobby connection; a battle they only watch is not theirs.
 {
  const watch=battleWatch();
  observeBattleMessage(watch,{visit:'v1',site:'play.pokemonshowdown.com',at,body:'|updateuser| Ash Fox|1|169|{}'});
  play(watch,1,{players:['Misty','Brock'],winner:'Misty'});
  assert.deepEqual(finishedBattles(watch),[],'watching other people play is not reviewed');
  play(watch,2,{players:['ashfox','Gary'],winner:'Gary'});
  assert.deepEqual(finishedBattles(watch).map(game=>[game.room,game.result,game.opponent,game.turns,game.format]),[[room(2),'lost','Gary',7,'[Gen 9] VGC 2026 Reg I']],'their own, matched by Showdown user id');
  observeBattleMessage(watch,{visit:'v1',site:'example.com',at,body:`>${room(3)}\n|init|battle\n|player|p1|Ash Fox|\n|win|Ash Fox`});
  assert.equal(finishedBattles(watch).length,1,'only sites whose battle protocol is known');
 }
 // Without a lobby name, the site asking them to choose says which side is theirs.
 {
  const watch=battleWatch();
  message(watch,4,['|init|battle','|player|p1|Rival|','|player|p2|Guest 99|']);
  message(watch,4,['|request|{"teamPreview":true,"side":{"name":"Guest 99","id":"p2","pokemon":[]}}']);
  message(watch,4,['|tie']);
  assert.deepEqual(finishedBattles(watch).map(game=>[game.result,game.self,game.opponent]),[['tie','Guest 99','Rival']]);
 }
 // Not while a battle is on; then once they stop; then not again until enough time has passed.
 {
  const watch=fresh();
  play(watch,1);play(watch,2,{end:false});
  at+=BATTLE_REVIEW.quietSeconds+60;
  assert.equal(battleReviewDue(watch,at,day),null,'not in the middle of a battle');
  message(watch,2,['|win|Rival2']);
  assert.equal(battleReviewDue(watch,at,day),null,'not right after a result');
  at+=BATTLE_REVIEW.quietSeconds;
  const due=battleReviewDue(watch,at,day)!;
  assert.deepEqual(due.map(game=>game.result),['won','lost'],'both games of the session');
  battlesReviewed(watch,due,at,day);
  play(watch,3);at+=BATTLE_REVIEW.quietSeconds;
  assert.equal(battleReviewDue(watch,at,day),null,'not again so soon');
  at+=BATTLE_REVIEW.minGapSeconds;
  assert.deepEqual(battleReviewDue(watch,at,day)?.map(game=>game.room),[room(3)],'later, the new game only');
 }
 // An abandoned battle does not hold a review back forever.
 {
  const watch=fresh();
  play(watch,1);play(watch,2,{end:false});
  at+=BATTLE_REVIEW.staleSeconds;
  assert.equal(battleReviewDue(watch,at,day)?.length,1);
 }
 // Ten games are a batch: reviewed even while they keep playing, at most ten at a time.
 {
  const watch=fresh();
  for(let n=1;n<=12;n++)play(watch,n,{winner:n%3?'Ashfox':'Rival'+n});
  play(watch,13,{end:false});
  const due=battleReviewDue(watch,at,day)!;
  assert.equal(due.length,BATTLE_REVIEW.batch,'the newest ten');
  assert.equal(due[0].room,room(3));
  battlesReviewed(watch,due,at,day);
  assert.deepEqual(finishedBattles(watch),[],'older ones are left for the person to ask about');
 }
 // At most a few proactive reviews a day; the next day starts over.
 {
  const watch=fresh();
  for(let n=1;n<=BATTLE_REVIEW.perDay+1;n++){
   play(watch,n);at+=BATTLE_REVIEW.minGapSeconds;
   const due=battleReviewDue(watch,at,day);
   if(n<=BATTLE_REVIEW.perDay){assert.equal(due?.length,1,`review ${n}`);battlesReviewed(watch,due!,at,day);}
   else assert.equal(due,null,'the day’s reviews are used up');
  }
  assert.equal(battleReviewDue(watch,at,'2026-10-05')?.length,1,'a new day');
 }
 // Games from long ago are not reviewed out of the blue.
 {
  const watch=fresh();
  play(watch,1);at+=BATTLE_REVIEW.maxAgeSeconds+1;
  assert.equal(battleReviewDue(watch,at,day),null);
 }
 // The host: a busy Fox asks again later; an Agent that cannot review drops the games.
 {
  let outcome:'started'|'later'|'never'='later',asked=0,now=at;
  const host=new BattleReviews({now:()=>now,day:()=>day,local:()=>'',start:()=>{asked++;return outcome;}});
  const records=(n:number,body:string)=>[{visit:'v9',at:now,kind:'ws-in' as const,url:'wss://sim3.psim.us/showdown/websocket',meta:{},body:`>${room(n)}\n${body}`}];
  const visits=[{id:'v9',site:'play.pokemonshowdown.com',url:'https://play.pokemonshowdown.com/',title:'Showdown!',applet:'app-pokemon-showdown',startedAt:now,endedAt:now}];
  host.observe(visits,[{visit:'v9',at:now,kind:'ws-in',url:'',meta:{},body:'|updateuser| Ashfox|1|1|{}'}]);
  host.observe(visits,records(1,'|init|battle\n|player|p1|Ashfox|\n|player|p2|Rival|'));
  host.observe(visits,records(1,'|turn|3\n|win|Rival'));
  now+=BATTLE_REVIEW.quietSeconds;
  assert.equal(host.check(),null);assert.equal(asked,1,'Fox was asked');
  outcome='never';
  assert.equal(host.check(),null);assert.equal(asked,2,'and asked again');
  assert.equal(host.check(),null);assert.equal(asked,2,'until it said never');
  host.stop();
 }
}

// What Fox is told ------------------------------------------------------------------------------------
const guidance=conversationGuidance({scope:'private'});
assert.match(guidance,/review games they played in the built-in browser[^\n]*browser\/records[^\n]*only "network"[^\n]*as a coach/,'Fox knows how to review games');
assert.match(guidance,/帮我复盘最近几局/);
assert.equal(conversationGuidance({scope:'sample'}),'');
const browse=listWorldTools().find((tool:any)=>tool.name==='browse_web');
assert.match(browse.description,/offset is always a record number, also with only or query/);
console.log('PASS Fox finds an evening of browser games, lists them, reads each one team preview to result in at most two pages, and is told to review them as a coach; once the person stops playing, Worldlet hands it the games to review');
