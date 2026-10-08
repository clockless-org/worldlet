import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// Curated-source Applets (read-only cards from a connected account): one fixture, one row per provider.
type Case={applets:string[];provider:string;label:string;url:string;details:Record<string,unknown>;notice?:string;detailLine:RegExp;web:boolean;pass:string};
const cases:Case[]=[
 {applets:['google-drive','google-docs','google-sheets','google-slides'],provider:'google-drive',label:'Google Drive',url:'https://drive.google.com/file/d/',details:{type:'application/vnd.google-apps.document',modified:'2026-10-01'},notice:'Google Docs text export.',detailLine:/Modified: 2026-10-01/,web:true,pass:'cards, originals, shared-account reauthorization, disconnect and Web switch.'},
 {applets:['supabase'],provider:'supabase',label:'Supabase',url:'https://drive.google.com/file/d/',details:{type:'project',modified:'2026-10-01'},notice:'Project metadata.',detailLine:/Modified: 2026-10-01/,web:true,pass:'cards, originals, shared-account reauthorization, disconnect and Web switch.'},
 {applets:['docker'],provider:'docker',label:'Docker',url:'https://drive.google.com/file/d/',details:{type:'project',modified:'2026-10-01'},notice:'Project metadata.',detailLine:/Modified: 2026-10-01/,web:false,pass:'cards, details and no misleading Web/account toggle.'},
 {applets:['linear'],provider:'linear',label:'Linear',url:'https://linear.app/acme/issue/',details:{status:'In Progress',priority:'Urgent'},detailLine:/Status: In Progress/,web:true,pass:'native issue cards, full description/metadata, Web switch and read-only calls.'},
 {applets:['todoist'],provider:'todoist',label:'Todoist',url:'https://app.todoist.com/app/task/',details:{priority:'p1',dueDate:'2026-10-01',checked:false},detailLine:/Due: 2026-10-01/,web:true,pass:'native task cards, full description/metadata, Web switch and read-only calls.'},
];
await withBrowser(fileAccess,async browser=>{
 for(const c of cases)for(const applet of c.applets){
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(({applet,c})=>{
  window.testApplet=applet;
  window.calls=[];
  window.fixture={workspaceId:c.provider+'-test',revision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,hostCapabilities:{version:1,features:{curatedSourceRead:true}},connections:[{id:'hermes-'+c.provider,provider:c.provider,syncStatus:'connected',connected:true,contentRevision:'0:1'}],onboarding:{completed:true},sampleEnabled:false,sampleUI:{},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='curatedSourceContent'&&!fixture.connections.length)throw Error('Connect '+c.label+' first.');
   if(b.action==='curatedSourceContent')return b.operation==='list'?{pages:Array.from({length:5},(_,i)=>({id:'task'+i,title:'Task '+i,list:'p1 · 2026-10-01',description:'Full source body',url:c.url+'task'+i})),scope:'Active tasks · Read only',next:null,connected:true}:{id:b.id,title:'Task '+b.id,description:'Full original description, without truncation.',details:c.details,...(c.notice?{notice:c.notice}:{}),...(testApplet==='google-sheets'?{table:[['Name','Value'],['<script>bad()</script>','42']]}:{})};
   if(b.action==='weatherLoad')return null;return {ok:true};
  }}}};
 },{applet,c:{provider:c.provider,label:c.label,url:c.url,details:c.details,notice:c.notice}});
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0,undefined,{timeout:60000});
 await page.evaluate(()=>location.hash='object=app-'+window.testApplet);
 await page.waitForFunction(()=>document.querySelectorAll('.pixi-stage-item').length>0).catch(async e=>{console.log(applet,await page.evaluate(()=>({calls,hash:location.hash,text:document.body.innerText.slice(-2500)})));throw e;});
 assert.ok(await page.locator('.pixi-stage-item').first().innerText());
 await page.locator('.pixi-stage-item').first().click();
 await page.waitForFunction(()=>document.querySelector('.app-source-body')?.textContent.includes(testApplet==='google-sheets'?'42':'Full original description'));
 if(applet==='google-sheets'){assert.equal(await page.locator('td').last().innerText(),'42');assert.equal(await page.locator('.curated-source-table script').count(),0);}else assert.match(await page.locator('.app-source-body').innerText(),c.detailLine);
 if(c.web){
  await page.locator('.applet-mode-web').click();await page.locator('.browser-viewport').waitFor();
  await page.locator('.applet-mode-native').click();await page.locator('.app-source-body').waitFor();
 }else assert.equal(await page.locator('.applet-mode-toggle').count(),0);
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='curatedSourceContent'&&!['list','read'].includes(c.operation))),false);
 await page.evaluate(()=>{window.listCountBefore=calls.filter(c=>c.action==='curatedSourceContent'&&c.operation==='list').length;fixture.connections[0].contentRevision='0:2';fixture.revision++;window.worldletReceive(structuredClone(fixture));});
 await page.waitForFunction(()=>calls.filter(c=>c.action==='curatedSourceContent'&&c.operation==='list').length>listCountBefore);
 await page.evaluate(()=>{fixture.connections=[];fixture.revision++;window.worldletReceive(structuredClone(fixture));});
 await page.waitForFunction(()=>!document.querySelector('.app-source-body')?.textContent.includes(testApplet==='google-sheets'?'42':'Full original description')&&document.querySelectorAll('.pixi-stage-item').length===0);
 assert.deepEqual(errors,[]);
 console.log('PASS '+applet+' '+c.pass);await page.close();
 }
});
