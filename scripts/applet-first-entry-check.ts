// #1281: an Applet opened right after onboarding shows its content at once, without a refresh or
// leaving and re-entering: findings that arrive while it is open appear, and Mail keeps Fox's
// findings after Fox's own reads streamed letters in.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(20000);
 await page.addInitScript(()=>{const w=window as any;
  w.item=(id,provider,kind,title)=>({id,kind,provider,status:'open',priority:'high',title,context:'One short line.',reason:'One short line.',attentionContentVersion:1,policyVersion:2,summary:'Longer.',...(kind==='task'?{attentionReason:'r'}:{}),sources:[{provider,id:id+'s',quote:'q'}],observedAt:new Date().toISOString(),createdAt:1,updatedAt:2});
  w.fixture={workspaceId:'first-entry',revision:1,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:['gmail','apple-notes'].map(provider=>({id:'c-'+provider,provider,label:provider,syncStatus:'connected',connected:true,running:false,failed:false,records:[]})),
   worldItems:[],sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  w.mailRead=null;
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent'&&b.provider==='apple-notes')return {pages:[{id:'live:note:1',title:'Garden ideas'}]};
   // Mail's read is held open so discovery can stream in before it returns.
   if(b.action==='appContent'&&b.provider==='gmail')return new Promise(resolve=>{w.mailRead=()=>resolve({pages:Array.from({length:3},(_,i)=>({id:'live:mail:'+i,title:'Letter '+(i+1),from:'Alex',date:'2026-09-23T10:32:00Z'}))});});
   if(b.action==='weatherLoad')return null;return {ok:true};
  }}}};});
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics?.renderer==='pixi-webgl');
 const items=()=>page.evaluate(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.presentation.stage?.items??-1);
 const open=async(id:string)=>{await page.evaluate(id=>location.hash='object='+id,id);await page.waitForFunction(id=>{const p=(document.querySelector('#notionWorld') as any).sceneMetrics.presentation;return p.stage&&p.id===id;},id);};

 // Notes opens before Fox's findings exist, then a finding arrives while it stays open.
 await open('app-apple-notes');
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.presentation.stage.items===1);
 await page.evaluate(()=>{const w=window as any;w.fixture.worldItems.push(w.item('n1','apple-notes','task','Book the cabin'));w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.presentation.stage.items===2,null,{timeout:5000}).catch(async()=>{throw Error('a finding that arrives while Notes is open shows without re-entry; stage items: '+await items());});

 // Mail: Fox's onboarding read streams letters in before the person opens Mail, and Fox's
 // finding from that read must be on Mail's board at once, beside the letters the open read returns.
 await page.evaluate(()=>{const w=window as any;location.hash='';window.dispatchEvent(new CustomEvent('worldlet:source-results',{detail:{provider:'gmail',pages:[{id:'live:mail:found',title:'Found by discovery',from:'Sam',date:'2026-09-23T11:00:00Z'}]}}));
  w.fixture.worldItems.push(w.item('g1','gmail','task','Confirm school pickup'));w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await open('app-gmail');
 await page.waitForFunction(()=>typeof (window as any).mailRead==='function');
 await page.evaluate(()=>(window as any).mailRead());
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any).sceneMetrics.presentation.stage.items===1,null,{timeout:5000}).catch(async()=>{throw Error('Mail shows its finding on first entry; stage items: '+await items());});
 assert.deepEqual(errors,[]);
 console.log('PASS Applet first entry: a finding arriving while an Applet is open shows at once, and Mail shows its finding after Fox streamed letters in');
});
