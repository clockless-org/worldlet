import assert from 'node:assert/strict';
import {parseMail,readableMail} from '../ui/applets/gmail/focus.ts';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {bundleScript} from './browser-test.ts';
const fixture='Status: Unread\n\n## From: Alice Chen <alice@example.com>\nTo: Kelvin <kelvin@example.com>\nSubject: Design review\n\nHello Kelvin,\n\nThe first draft is ready.\n\nFrom: this line is part of the body.';
assert.equal(parseMail(fixture).headers.from,'Alice Chen <alice@example.com>');assert.ok(parseMail(fixture).body.includes('From: this line'));assert.equal(parseMail('A note without headers').body,'A note without headers');
assert.equal(readableMail('Hello Kelvin,\nThe draft is ready.\n\n- First\n- Second'),'Hello Kelvin, The draft is ready.\n\n- First\n- Second');
const bundle=await bundleScript({stdin:{contents:"export * from './ui/applets/gmail/focus.ts';export {setMailAvatarLookup} from './ui/applets/gmail/presentation.ts';",resolveDir:'.'},globalName:'Mail'});
const browser=await chromium.launch();
try{const page=await browser.newPage({viewport:{width:1100,height:900}});await page.setContent('<main style="width:700px;height:760px;padding:20px;background:#8caa94;font-family:system-ui"></main>');await page.addStyleTag({content:await readFile('dist/WorldletWeb/worldlet-ui.css','utf8')});await page.addStyleTag({content:await readFile('resources/styles/builtin/controls.css','utf8')});await page.addStyleTag({content:await readFile('ui/applets/gmail/focus.css','utf8')});await page.addScriptTag({content:bundle});
await page.evaluate(text=>{const view=(window as any).Mail.renderMailFocus({title:'Design review',summary:'Alice has shared a first draft. Review the proposal before replying.',text:text+'\n\n'+('A longer original paragraph for checking pagination and preserving every word. '.repeat(20)+'\n\n').repeat(6),mail:{headers:{cc:'Team <team@example.com>',date:new Date(Date.now()-2*3600000).toISOString()},attachments:[{name:'Proposal.pdf',size:24000},{name:'<img src=x onerror=alert(1)>',size:32}]}},body=>{const n=document.createElement('div');n.className='notion-prose';for(const text of body.split('\n\n')){const p=document.createElement('p');p.textContent=text;n.append(p);}return n;});document.querySelector('main').append(view);},fixture);
await page.locator('.mail-sender-name').getByText('From Alice Chen',{exact:true}).waitFor();
assert.equal(await page.locator('.mail-sender-name').textContent(),'From Alice Chen');assert.equal(await page.locator('.mail-page-label').count(),0);assert.ok(await page.locator('.ui-applet-header>.mail-page-title').isVisible());assert.equal(await page.locator('.mail-avatar').count(),1);assert.match(await page.locator('.mail-date').textContent(),/2 hours ago/);assert.ok(await page.locator('.mail-date').getAttribute('title'));
// Scene night colors must not turn ink white on the permanently light Mail paper.
let paperColor='';
for(const time of ['day','night']){
 await page.locator('main').evaluate((e:HTMLElement,time)=>{e.classList.add('native-console');e.dataset.timeOfDay=time;},time);
 const color=await page.locator('.mail-focus').evaluate(e=>getComputedStyle(e).backgroundColor);
 if(time==='day')paperColor=color;else assert.equal(color,paperColor,'night preserves the light paper material');
 for(const selector of ['.mail-page-title','.mail-sender-name','.mail-message p']){
  assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).color),'rgb(32, 59, 48)',time+' readable primary ink: '+selector);
 }
 assert.equal(await page.locator('.mail-address').evaluate(e=>getComputedStyle(e).color),'rgb(77, 98, 85)',time+' readable secondary ink');
}
await page.waitForTimeout(220);await page.screenshot({path:'/tmp/mail-focus-cards.png'});
assert.equal(await page.locator('.mail-summary').count(),0,'Focus opens the original instead of a duplicate Fox summary');
assert.equal(await page.locator('.mail-pagination').count(),0,'original reads continuously');
assert.equal(await page.locator('.mail-attachment').count(),2,'all attachments retained');
assert.ok((await page.locator('.mail-file-name').last().textContent()).includes('<img'));
assert.equal(await page.locator('.mail-paper').evaluate((e:HTMLElement)=>e.scrollHeight>e.clientHeight),true,'long original scrolls without column clipping');
await page.locator('.mail-paper').evaluate((e:HTMLElement)=>e.scrollTop=e.scrollHeight);
assert.ok(await page.locator('.mail-file-name').last().isVisible());
assert.equal(await page.locator('.mail-avatar .mail-avatar-initials').textContent(),'AC','a sender without a picture shows initials, not a stock figure');
// The host's portrait replaces the initials; a logo sits whole on paper. A quoted reply starts folded.
const logo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#1d4"/></svg>').toString('base64');
await page.evaluate(([logo])=>{const M=(window as any).Mail;M.setMailAvatarLookup(async(address:string)=>address==='news@brand.io'?{image:logo,kind:'logo'}:address==='script@brand.io'?{image:'javascript:alert(1)'}:null);
 const body=(text:string)=>{const n=document.createElement('div');n.className='notion-prose';for(const part of text.split('\n\n')){const p=document.createElement('p');p.textContent=part;n.append(p);}return n;};
 const main=document.querySelector('main')!;main.replaceChildren(M.renderMailFocus({title:'News',text:'From: Brand <news@brand.io>\nSubject: News\n\nHello.\n\nOn Mon, Sep 29, 2026 Kelvin <k@x.io> wrote:\n\n> Earlier',mail:{}},body));
 const other=M.renderMailFocus({title:'X',text:'From: Script <script@brand.io>\nSubject: X\n\nHi',mail:{}},body);other.id='unsafe';main.append(other);},[logo]);
await page.locator('.mail-sender-portrait[data-kind=logo] img').waitFor();
assert.equal(await page.locator('.mail-sender-portrait[data-kind=logo] img').getAttribute('src'),logo);
assert.equal(await page.locator('#unsafe .mail-sender-portrait img').count(),0,'only data: images from the host are shown');
assert.equal(await page.locator('.mail-quoted').first().evaluate((e:HTMLDetailsElement)=>e.open),false);
assert.equal(await page.locator('.mail-message .notion-prose>p').first().textContent(),'Hello.');
await page.setViewportSize({width:700,height:600});await page.locator('main').evaluate((e:HTMLElement)=>{e.style.width='auto';e.style.height='530px';e.style.padding='12px';});
await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log('PASS Mail reader: sender initials and host portraits, folded quoted replies, original paragraphs, scrolling, complete attachments, safe metadata, responsive layout.');}finally{await browser.close();}
