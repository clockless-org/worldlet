/** The real Notes view, with fictional records and a controlled asynchronous original reader. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
const css=(await Promise.all(['dist/WorldletWeb/worldlet-ui.css','ui/frame/pixi-world.css','ui/applets/scene/applet-scene.css','ui/applets/apple-notes/open.css'].map(p=>readFile(p,'utf8')))).join('\n');
const script=await bundleScript({entryPoints:['scripts/fixtures/notes-notebook/main.ts']});
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1672,height:941}}),errors=pageErrors(page);
 await page.setContent('<style>body{margin:0}#viewport{position:fixed;inset:0}'+css+'</style><div id="notionWorld" class="notion-world native-console" style="position:fixed;inset:0"><main id="viewport" class="pixi-applet-stage" data-scene="apple-notes" data-applet="apple-notes"></main></div>');await page.addScriptTag({content:script});
 assert.ok(await page.locator('.notes-header h2').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>30),'World styles cannot shrink the notebook heading');assert.match(await page.locator('.notes-prose p').first().evaluate(e=>getComputedStyle(e).fontFamily),/Georgia/);assert.equal(await page.locator('.notes-row').count(),6);assert.deepEqual(await page.evaluate(()=>(window as any).notesFixture.acknowledged),[],'Opening the notebook does not mark unchosen notes read');assert.match(await page.locator('.notes-prose').innerText(),/Plant lavender/);
 await page.getByRole('button',{name:'Herb Care',exact:true}).click();assert.match(await page.locator('.notes-prose').innerText(),/Water the basil/);assert.deepEqual(await page.evaluate(()=>(window as any).notesFixture.acknowledged),['note-1']);
 await page.getByRole('button',{name:'Open original',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).notesFixture.opened),['note-1']);
 await page.getByRole('button',{name:'New note with Fox'}).click();assert.equal(await page.evaluate(()=>(window as any).notesFixture.created),1);
 await page.getByRole('button',{name:'Ideas',exact:true}).click();assert.equal(await page.locator('.notes-row').count(),2);
 await page.getByLabel('Search notes',{exact:true}).fill('sunny');assert.equal(await page.locator('.notes-row').count(),1);
 await page.getByLabel('Search notes',{exact:true}).fill('does not exist');assert.match(await page.locator('.notes-list').innerText(),/No matching notes/);assert.equal(await page.locator('.notes-title').count(),0);
 await page.getByLabel('Search notes',{exact:true}).fill('');await page.getByRole('button',{name:'All',exact:true}).click();
 // A slow original cannot overwrite the note selected after it, nor update Fox's reading context.
 await page.evaluate(()=>{const f=(window as any).notesFixture;f.selected=[];f.mount(f.items.slice(0,2).map(item=>({...item,record:{...item.record,text:undefined}})));});
 await page.getByRole('button',{name:'Herb Care',exact:true}).click();
 await page.evaluate(()=>{const f=(window as any).notesFixture;f.pending['note-1']({text:'Current original'});f.pending['note-0']({text:'Stale original'});});
 assert.equal(await page.locator('.notes-prose').innerText(),'Current original');assert.deepEqual(await page.evaluate(()=>(window as any).notesFixture.selected),['note-1']);
 await page.evaluate(()=>{const f=(window as any).notesFixture;f.fail=true;f.mount([{id:'failed',title:'Unavailable',record:{id:'failed'}}]);});
 await page.getByRole('button',{name:'Try again'}).waitFor();await page.evaluate(()=>(window as any).notesFixture.fail=false);await page.getByRole('button',{name:'Try again'}).click();
 await page.evaluate(()=>(window as any).notesFixture.pending.failed({text:'Recovered note'}));assert.equal(await page.locator('.notes-prose').innerText(),'Recovered note');
 // A detached Notes view must not consume a late response.
 await page.evaluate(()=>{const f=(window as any).notesFixture;f.selected=[];f.mount([{id:'late',title:'Late',record:{id:'late'}}]);document.querySelector('.notes-notebook')!.remove();f.pending.late({text:'Detached'});});
 assert.deepEqual(await page.evaluate(()=>(window as any).notesFixture.selected),[]);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>(window as any).notesFixture.mount());
 assert.equal(await page.locator('.notes-index').isVisible(),true);await page.getByRole('button',{name:'Garden Ideas',exact:true}).click();assert.equal(await page.locator('.notes-page').isVisible(),true);
 await page.getByRole('button',{name:'All notes',exact:true}).click();assert.equal(await page.locator('.notes-index').isVisible(),true);
 assert.ok(await page.locator('.notes-notebook').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'No horizontal overflow on a phone');
 assert.deepEqual(errors,[]);console.log('PASS Notes notebook: selection, search, folders, host actions, stale reads, retry, unmount and compact navigation');
});
