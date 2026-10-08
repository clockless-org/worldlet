import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
import {chromium} from 'playwright';
// Execute the exact embedded JXA the Electron host runs, with a fake Notes dictionary, never a personal library.
const source=await readFile('platform/electron/src/modules/sources/apple.ts','utf8').then(text=>text.replace(/\r\n/g,'\n')); // Windows checkouts may use CRLF.
const script=source.match(/const NOTES_WRITE=String\.raw`\n([\s\S]*?)\n`;/)![1];
assert(!script.includes('${'),'the Notes script has no template substitutions');
let writes=0,body='<div>Original</div>';
const folder={exists:()=>true,name:()=> 'Notes',id:()=> 'folder-1'};
const note:any={exists:()=>true,passwordProtected:()=>false,shared:()=>false,attachments:()=>[],container:()=>folder,name:()=> 'Title',id:()=> 'note-1',plaintext:()=> 'Title\nSafe <b>text</b> & quote'};
Object.defineProperty(note,'body',{get:()=>()=>body,set:v=>{body=v;writes++}});
const app={notes:{byId:()=>note},folders:{byId:()=>folder},defaultAccount:()=>({defaultFolder:()=>folder}),make:args=>{writes++;body=args.withProperties.body;return note}};
const run=(q)=>JSON.parse(vm.runInNewContext(script,{ObjC:{import:()=>{},unwrap:x=>x},$:{NSFileHandle:{fileHandleWithStandardInput:{readDataToEndOfFile:JSON.stringify(q)}},NSString:{alloc:{initWithDataEncoding:x=>x}},NSUTF8StringEncoding:4},Application:()=>app}));
const facts=run({operation:'append',id:'note-1',commit:false});assert.equal(writes,0);
assert.throws(()=>run({operation:'append',id:'note-1',commit:true,originalBody:'stale',text:'T'}));assert.equal(writes,0);
run({operation:'append',id:'note-1',commit:true,originalBody:facts.originalBody,text:'Safe <b>text</b> & quote'});
assert.ok(body.includes('Safe &lt;b&gt;text&lt;/b&gt; &amp; quote'));assert.ok(body.startsWith('<div>Original</div>'));
// Create previews without writing, then escapes and reads back through plaintext.
const created=run({operation:'create',title:'Worldlet test <note>',commit:false});assert.equal(writes,1);assert.equal(created.destination,'Notes');
run({operation:'create',title:'Worldlet test <note>',text:'Safe <b>text</b> & quote',folderID:created.folderID,commit:true});assert.equal(writes,2);assert.ok(body.startsWith('<h1>Worldlet test &lt;note&gt;</h1>'));
// Locked, shared and attachment notes are rejected before preview or commit; failed readback is an error.
for(const [key,value] of [['passwordProtected',true],['shared',true],['attachments',['a']]] as const){const saved=note[key];note[key]=()=>value;
 for(const commit of [false,true])assert.throws(()=>run({operation:'append',id:'note-1',commit,originalBody:body,text:'T'}),/locked|shared notes/);note[key]=saved;}
assert.equal(writes,2);
note.plaintext=()=> 'unchanged';assert.throws(()=>run({operation:'append',id:'note-1',commit:true,originalBody:body,text:'T'}),/needs checking/);
const temp=await mkdtemp(path.join(tmpdir(),'home-review-'));
const browser=await chromium.launch({headless:true});
try{
 await build({entryPoints:['ui/companion/fox-home-review.ts'],outfile:path.join(temp,'review.js'),bundle:true,format:'iife',globalName:'Review'});
 const page=await browser.newPage();await page.setContent('<main></main>');await page.addScriptTag({path:path.join(temp,'review.js')});
 await page.evaluate(()=>{const w=window as any;w.calls=[];w.Review.mountHomeReview(async(a,b)=>{w.calls.push({a,b});return {status:'verified'}},()=>({setGuide:g=>{const root=document.querySelector('main');root!.replaceChildren();if(g){root!.append(document.createTextNode(g.text),g.body,...g.actions)}}}));w.emit=()=>window.dispatchEvent(new CustomEvent('worldlet:home-review',{detail:{id:'test',targetTitle:'Title',destination:'Personal',plan:{provider:'apple-notes',operation:'append',text:'<script>literal</script>'}}}));w.emit();});
 assert.equal(await page.evaluate(()=>(window as any).calls.length),0);
 assert.ok((await page.locator('main').innerText()).includes('<script>literal</script>'));
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.length),1);
 assert.equal(await page.getByRole('button',{name:'Confirm',exact:true}).count(),0);
 await page.evaluate(()=>(window as any).emit());await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls[1].b.operation),'discard');
 await page.evaluate(()=>{const w=window as any;window.dispatchEvent(new CustomEvent('worldlet:home-review',{detail:{id:'todoist-review',targetTitle:'Finish task',destination:'Todoist',description:'<img onerror=alert(1)> literal description',notice:'No active subtasks.',plan:{provider:'todoist',operation:'complete'}}}));});
 assert.ok((await page.locator('main').innerText()).includes('<img onerror=alert(1)> literal description'));
 assert.equal(await page.locator('main img').count(),0);
 await page.getByRole('button',{name:'Confirm',exact:true}).dblclick();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.b.id==='todoist-review').length),1);
 // Calendar/Reminders reviews show every changed field; a failed commit shows no retry control.
 await page.evaluate(()=>{const w=window as any;w.Review.mountHomeReview(async(a,b)=>{w.calls.push({a,b});if(b.operation==='commit')throw Error('Calendar saved the request, but its result could not be verified.');return {}},()=>({setGuide:g=>{const root=document.querySelector('main');if(g){root!.replaceChildren(document.createTextNode(g.text),g.body,...g.actions)}}}));window.dispatchEvent(new CustomEvent('worldlet:home-review',{detail:{id:'calendar-review',targetTitle:'Worldlet test event',destination:'Worldlet Test',plan:{provider:'google-calendar',operation:'reschedule',start:'2026-10-01T09:30:00-07:00',end:'2026-10-01T10:30:00-07:00'}}}));});
 for(const text of ['Worldlet Test','2026-10-01T09:30:00-07:00','2026-10-01T10:30:00-07:00','reschedule'])assert.ok((await page.locator('main').innerText()).includes(text));
 await page.getByRole('button',{name:'Confirm',exact:true}).first().click();
 await page.waitForFunction(()=>document.querySelector('main')!.textContent!.includes('Check the source before trying again.'));
 assert.equal(await page.getByRole('button',{name:'Confirm',exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.b.id==='calendar-review').length),1);
 console.log('PASS Todoist review original description, escaped source and one-use confirmation.');
 console.log('PASS actual Notes script: create/append preview without writes, conflict, locked/shared/attachment rejection, escaping, readback; Fox review: no implicit write, full change, confirmation, cancellation, no replay after an uncertain result');
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
