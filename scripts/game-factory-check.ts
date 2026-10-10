// The Game Factory's rules (core/games/README.md) without a host: what a made game may contain, the page
// it runs as, what the host reads back, the energy it needs, and that making stays closed for now.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {widgetDocument,WIDGET_POLICY} from '../core/artifacts/index.ts';
import {checkMadeGameSource,madeGameDocument,readMadeGameReport,madeGameRecord,readMadeGame,orderMadeGames,madeGameTrialProblems,gameFactoryEnergy,madeGameId,validMadeGameId,madeGameTask,betterBest,GAME_MAKING_OPEN,MADE_GAME_POLICY,SANDBOX_POLICY,MADE_GAME_REPORT,GAME_FACTORY_APPLET} from '../core/games/index.ts';
import {createWorldToolRuntime} from '../platform/bridge/world-tool-runtime.ts';
import {worldActions,listWorldTools} from '../core/tools/index.ts';
import {APP_DEFINITIONS} from '../core/applets/index.ts';

// A plain canvas game passes; SVG namespaces, `rect.top`, `node.parent` and location.reload are not network use.
const good=`<!doctype html><html><head><title>Fox run</title><style>body{margin:0}</style></head><body><canvas id="c"></canvas><script>
const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const rect={top:1},node={parent:{x:2}};node.parent.x+rect.top;
const c=document.getElementById('c').getContext('2d');c.fillRect(0,0,10,10);addEventListener('keydown',()=>location.reload());window.worldlet.best(3);</script></body></html>`;
assert.deepEqual(checkMadeGameSource(good),[]);
for(const [source,pattern] of [
 ['<script>fetch("/x")</script>',/fetch/],['<script>new WebSocket("wss://a")</script>',/addresses|WebSocket/],['<script>1</script><img src="https://example.com/a.png">',/addresses/],
 ['<script>1</script><iframe></iframe>',/iframe/],['<script>document.cookie="a"</script>',/cookies/],['<script>window.location="x"</script>',/navigating away/],
 ['<script>top.postMessage(1,"*")</script>',/other windows/],['<script src="game.js"></script>',/external scripts/],['<div>no code</div>',/no <script>/],
 ['<script>import("./a.js")</script>',/import/],['<script>'+'x'.repeat(300_001)+'</script>',/KB/],['',/empty/],
] as [string,RegExp][])assert.ok(checkMadeGameSource(source).some(problem=>pattern.test(problem)),'refused: '+source.slice(0,40));
// The prelude goes first, right after the doctype, before any of the game's own markup or code, and carries the policy.
const page=madeGameDocument(good);
assert.ok(page.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"'));
assert.ok(page.indexOf(MADE_GAME_POLICY)<page.indexOf('<title>Fox run'));
assert.match(MADE_GAME_POLICY,/connect-src 'none'/);assert.match(MADE_GAME_POLICY,/frame-src 'none'/);assert.doesNotMatch(MADE_GAME_POLICY,/https?:/);
assert.ok(madeGameDocument('<p>x</p><script>1</script>').startsWith('<!doctype html><meta http-equiv'));
assert.ok(madeGameDocument('<html lang="en"><body></body></html>').startsWith('<!doctype html><meta http-equiv'));
// Code before the page's <head> (or with no <head> at all) still comes after the policy (it used to run first).
for(const early of ['<!DOCTYPE html><script>steal()</script><html><head></head></html>','<script>steal()</script><head><title>x</title></head>','<!-- made --><!doctype html><body onload="steal()"><head></head>'])
 for(const made of [madeGameDocument(early),widgetDocument(early)]){
  assert.ok(made.indexOf(SANDBOX_POLICY)>=0&&made.indexOf(SANDBOX_POLICY)<made.indexOf('steal()'),'the policy precedes every page byte: '+early);
  assert.match(made,/^(<!--[^>]*-->)?<!doctype html><meta http-equiv="Content-Security-Policy"/i,'the doctype stays first');
 }
assert.equal(MADE_GAME_POLICY,WIDGET_POLICY,'games and Moment Applets share one policy');
// Reports: only our prefix, bounded, numbers for best scores.
assert.deepEqual(readMadeGameReport(MADE_GAME_REPORT+'{"best":42}'),{best:42});
assert.deepEqual(readMadeGameReport(MADE_GAME_REPORT+'{"error":"boom"}'),{error:'boom'});
for(const line of ['{"best":42}',MADE_GAME_REPORT+'{"best":"42"}',MADE_GAME_REPORT+'{"best":1e13}',MADE_GAME_REPORT+'nope',null])assert.equal(readMadeGameReport(line),null);
assert.equal(betterBest(null,3),3);assert.equal(betterBest(5,3),5);assert.equal(betterBest(5,8),8);
// Records: cleaned, versions counted, the person's words kept, newest first.
const id=madeGameId(()=>0.5);assert.ok(validMadeGameId(id));assert.ok(!validMadeGameId('../x'));
const first=madeGameRecord({title:'  Fox   run  ',blurb:'Jump the logs',color:'#ABCDEF'},{id,idea:'like flappy bird',now:10});
assert.deepEqual([first.title,first.color,first.version,first.ideas],['Fox run','#abcdef',1,['like flappy bird']]);
const second=madeGameRecord({title:'',color:'red'},{id,idea:'slower',now:20,previous:{...first,best:7}});
assert.deepEqual([second.title,second.color,second.version,second.createdAt,second.best,second.ideas],['Fox run','#abcdef',2,10,7,['like flappy bird','slower']]);
assert.deepEqual(readMadeGame(JSON.parse(JSON.stringify(second))),second);assert.equal(readMadeGame({id:'bad'}),null);
assert.deepEqual(orderMadeGames([first,{...second,id:'game-zzzzzzzzzz'}]).map(game=>game.updatedAt),[20,10]);
// The trial's verdict.
assert.deepEqual(madeGameTrialProblems({loaded:true,errors:[],distinctColors:40}),[]);
assert.equal(madeGameTrialProblems({crashed:true}).length,1);
assert.ok(madeGameTrialProblems({loaded:true,distinctColors:1}).some(problem=>/blank/.test(problem)));
assert.ok(madeGameTrialProblems({loaded:false,errors:['x is not defined']}).length===2);
// Energy: the person's own only.
assert.equal(gameFactoryEnergy('chatgpt').ok,true);assert.equal(gameFactoryEnergy('own').ok,true);
for(const source of ['none'] as const){const result=gameFactoryEnergy(source);assert.equal(result.ok,false);assert.match((result as any).error,/API key/);}
assert.ok(madeGameTask('a fox game').length<2000&&madeGameTask('x'.repeat(5000),second).length<2000);
assert.match(madeGameTask('slower',second),/replaces "game-/);
// Making games is coming soon: Fox is offered none of the tools, so a call is refused as unknown.
assert.equal(GAME_MAKING_OPEN,false);
assert.ok(!listWorldTools().some(tool=>['make_game','save_game','read_made_game','list_made_games'].includes(tool.name)));
assert.ok(!worldActions().some(action=>action.target==='games'));
const calls:any[]=[];
assert.match((await createWorldToolRuntime({execute:async()=>({ok:true}),call:async(action:string)=>{calls.push(action);return {ok:true};},request:'Make me a game like Flappy Bird'}).callTool('make_game',{idea:'like Flappy Bird'},'1')).error,/Unknown World tool/);
assert.equal(calls.length,0);
assert.equal(APP_DEFINITIONS.some(app=>app.id===GAME_FACTORY_APPLET),false,'the Factory is the Games landmark, not an Applet');
// The host side: every made game's and Moment Applet's contents (trial, Game Factory and Widgets players) is
// locked the same way, including WebRTC, whose UDP never passes the session's request filter.
{
 const read=(file:string)=>readFileSync(new URL('../platform/electron/src/modules/'+file,import.meta.url),'utf8');
 const trial=read('games/trial.ts'),lock=trial.slice(trial.indexOf('export function lockGameContents'),trial.indexOf('export function placeGameView'));
 assert.match(lock,/setWebRTCIPHandlingPolicy\('disable_non_proxied_udp'\)/);assert.match(lock,/action:'deny'/);assert.match(lock,/will-navigate/);assert.match(lock,/will-redirect/);
 assert.match(trial.slice(trial.indexOf('export async function tryMadeGame')),/lockGameContents\(contents\)/,'the trial');
 for(const player of ['games/player.ts','widgets/player.ts'])assert.match(read(player),/lockGameContents\(contents\)/,player);
}
console.log('PASS Game Factory: offline-only pages, sandbox prelude and reports, records, own-energy rule; making is coming soon and Fox is offered no game tools.');
