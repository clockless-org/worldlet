/** The real Notes view, with fictional records and a controlled asynchronous original reader. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
const css=(await Promise.all(['dist/WorldletWeb/worldlet-ui.css','ui/shell/pixi-world.css','ui/applets/scene/applet-scene.css','ui/applets/apple-notes/open.css'].map(p=>readFile(p,'utf8')))).join('\n');
const script=await bundleScript({entryPoints:['scripts/fixtures/notes-notebook/main.ts']});
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844}}),errors=pageErrors(page);
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
 // Separate measured leaves preserve the same notebook and source boundaries.
 const projected=await browser.newPage({viewport:{width:1500,height:844}}),projectedErrors=pageErrors(projected);
 await projected.setContent('<style>body{margin:0}#viewport{position:fixed;inset:0}'+css+'</style><div id="notionWorld" class="notion-world native-console" style="position:fixed;inset:0"><main id="viewport" class="pixi-applet-stage" data-scene="apple-notes" data-applet="apple-notes"></main></div>');
 await projected.evaluate(()=>(window as any).__NOTES_REGIONS__=true);await projected.addScriptTag({content:script});
 assert.equal(await projected.locator('.applet-scene').getAttribute('data-compact'),'false','a distributed reader below 420 px retains its measured pages');assert.equal(await projected.locator('.notes-region').count(),4);
 await projected.getByRole('button',{name:'Herb Care',exact:true}).click();assert.match(await projected.locator('.notes-prose').innerText(),/Water the basil/);
 await projected.getByLabel('Search notes',{exact:true}).fill('sunny');await projected.evaluate(()=>(window as any).notesFixture.mount());assert.equal(await projected.getByLabel('Search notes',{exact:true}).inputValue(),'sunny');assert.equal(await projected.getByLabel('Search notes',{exact:true}).evaluate(e=>document.activeElement===e),true);
 await projected.getByLabel('Search notes',{exact:true}).fill('');await projected.getByRole('button',{name:'Ideas',exact:true}).click();assert.equal(await projected.locator('.notes-row').count(),2);
 await projected.getByRole('button',{name:'Sunny Day Notes',exact:true}).focus();await projected.keyboard.press('Enter');await projected.evaluate(()=>(window as any).notesFixture.mount());assert.equal(await projected.getByRole('button',{name:'Sunny Day Notes',exact:true}).evaluate(e=>document.activeElement===e),true);
 await projected.getByRole('button',{name:'Open original',exact:true}).click();assert.deepEqual(await projected.evaluate(()=>(window as any).notesFixture.opened),['note-4']);
 assert.deepEqual(projectedErrors,[]);await projected.close();
 assert.deepEqual(errors,[]);console.log('PASS Notes notebook: selection, search, folders, host actions, stale reads, retry, unmount, projected leaves and refresh focus at 1500 × 844');
});
