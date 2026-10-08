import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
const bundle=await bundleScript({stdin:{contents:`import {mountAttentionPreview} from './ui/attention/attention-preview.ts';window.mount=mountAttentionPreview;`,resolveDir:process.cwd(),loader:'ts'}});
const browser=await chromium.launch({args:['--no-sandbox']});
try{
 const page=await browser.newPage({timezoneId:'America/Los_Angeles',locale:'en-US'});
 await page.setContent('<main id="root"></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const w=window as any;w.preview=w.mount({root:document.querySelector('#root'),onClose(){},onOriginal(){},onLink(){}});
  w.open=(signal,members?)=>w.preview.open({title:'Synthetic deadline',worldItemKind:'task',worldItemId:'fixture',worldItemSignal:{summary:'Synthetic evidence only.',...signal},attentionTimeMembers:members});
  w.open({dueAt:'2026-10-01T18:00:00Z',observedAt:'2026-09-30T19:00:00Z',sourceUpdatedAt:'2026-09-30T20:00:00Z'});
 });
 const when=page.locator('.attention-preview-when');
 assert.match(await when.textContent(),/Due.*Oct 1.*11:00 AM/);
 assert.equal(await when.getAttribute('data-deadline'),'true');
 const title=await when.getAttribute('title');assert.match(title,/America\/Los_Angeles/);assert.match(title,/GMT-07:00/);assert.match(title,/First observed/);assert.match(title,/Source updated/);
 assert.equal(await when.getAttribute('aria-label'),title);
 // Timeliness at a glance (owner decision 2026-10-04): how far away, and when the mail came.
 await page.evaluate(()=>{const day=86400000;(window as any).open({dueAt:new Date(Date.now()-2*day-3600000).toISOString(),receivedAt:new Date(Date.now()-5*day).toISOString()});});
 assert.equal(await page.locator('.attention-preview-age').textContent(),'Overdue by 2 days · Received 5 days ago');
 assert.equal(await when.getAttribute('data-overdue'),'true');assert.match(await when.getAttribute('title'),/Received: /);
 await page.evaluate(()=>{const day=86400000;(window as any).open({receivedAt:new Date(Date.now()-3*day).toISOString()});});
 assert.match(await when.textContent(),/Received · /);assert.equal(await page.locator('.attention-preview-age').textContent(),'3 days ago');
 assert.equal(await when.getAttribute('data-overdue'),'false');
 await page.evaluate(()=>(window as any).open({},[{occurredAt:'2026-09-30T18:00:00Z'},{}]));
 assert.equal((await when.textContent()).trim(),'Multiple source times');assert.match(await when.getAttribute('title'),/Member 2: Time unknown/);
 await page.evaluate(()=>(window as any).open({observedAt:'2026-09-30T19:00:00Z'}));
 assert.match(await when.textContent(),/First observed/);assert.doesNotMatch(await when.textContent(),/Occurred/);
 await page.evaluate(()=>(window as any).open({updatedAt:'2026-09-30T19:00:00Z'}));assert.equal(await when.isHidden(),true);
 const escaped=await page.evaluate(()=>{const w=window as any;w.preview.close();let escaped=false;document.addEventListener('keydown',()=>{escaped=true;},{once:true});document.querySelector('#attentionPreview').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return escaped;});
 assert.equal(escaped,true,'A hidden preview must not swallow Escape from its former focus target');
 console.log('PASS browser Attention card local timezone tooltip, deadline emphasis, overdue and received lines, observation labels and conservative group/missing-time display');
}finally{await browser.close();}
