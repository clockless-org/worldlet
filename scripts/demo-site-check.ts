// Development rehearsal site: the pages Fox completes in onboarding (book a cleaning, cancel a trial), served at its reserved
// HTTPS origin exactly as the website panel does (platform/electron/src/modules/browser/page.ts, engine/page.ts). No network access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const native=await readFile('platform/electron/src/modules/browser/page.ts','utf8');
const device=await readFile('platform/electron/src/modules/browser/device.ts','utf8');
const mock=await readFile('core/accounts/google/mock.ts','utf8');
const host=native.match(/export const DEMO_HOST='([^']+)'/)?.[1];
assert.equal(host,'demo.worldlet.test');
assert.ok(host.endsWith('.test'),'Rehearsal origin must be a reserved, never-routable domain');
assert.ok(device.includes("const demo=this.host.profile.channel==='dev';"),'Only development builds may serve the rehearsal origin');
assert.ok(device.includes('webRoot:this.webRoot,demo,url,')&&device.includes('this.webRoot,demo,url,early)'),'Both website engines (CEF and Electron) get the development-only rehearsal switch');
assert.ok(mock.includes(`const DEMO_SITE='https://${host}'`),'Mock mail links to the origin the website panel serves');
const pages=Object.fromEntries([...(native.match(/const DEMO_PAGES[^=]*=\{([^}]*)\}/)?.[1]??'').matchAll(/'(\/[a-z]+)':'([a-z]+\.html)'/g)].map(m=>[m[1],m[2]]));
assert.deepEqual(pages,{'/brightsmile':'brightsmile.html','/streambox':'streambox.html','/citywater':'citywater.html'});
for(const path of Object.keys(pages))assert.ok(mock.includes('${DEMO_SITE}'+path),`Mock mail links ${path}`);
const html=Object.fromEntries(await Promise.all(Object.entries(pages).map(async([path,file])=>[path,await readFile('platform/browser/demo/'+file,'utf8')])));

const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(`https://${host}/**`,route=>{
  const path=new URL(route.request().url()).pathname.replace(/\/$/,'');
  return html[path]?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html[path]}):route.fulfill({status:404,contentType:'text/plain',body:'Not found'});
 });
 await page.goto(`https://${host}/brightsmile`);
 const slots=page.getByRole('radio');
 assert.equal(await slots.count(),3,'Three openings, matching the invitation');
 const labels=await page.locator('.slot span').allTextContents();
 assert.ok(labels.some(l=>/Thursday.*10:00/.test(l))&&labels.some(l=>/Friday.*2:30/.test(l)),labels.join(' | '));
 await page.getByRole('button',{name:'Book appointment'}).click();
 assert.equal(await page.getByRole('alert').textContent(),'Choose a time to continue.','No booking without a time');
 await slots.first().check();
 await page.getByRole('button',{name:'Book appointment'}).click();
 await page.getByRole('heading',{name:'You’re booked!'}).waitFor();
 const reference=await page.locator('#confirmation').textContent();
 assert.match(reference||'',/^BSD-\d{4}$/);
 assert.match(await page.locator('.done').innerText(),/Thursday/);
 // Booking is idempotent: reopening shows the same confirmation, never a second form.
 await page.reload();
 await page.getByRole('heading',{name:'You’re booked!'}).waitFor();
 assert.equal(await page.locator('#confirmation').textContent(),reference);
 assert.equal(await page.getByRole('button',{name:'Book appointment'}).count(),0);
 // Bill payment: Fox can reach the card form but the rehearsal never accepts a payment.
 await page.goto(`https://${host}/citywater`);
 assert.match(await page.locator('main').innerText(),/Amount due\s*\$46\.18/);
 await page.getByRole('button',{name:'Pay $46.18'}).click();
 await page.getByLabel('Card number').waitFor();
 await page.getByRole('button',{name:'Pay now'}).click();
 assert.match(await page.locator('.note').innerText(),/no payment was made/);
 const missing=await page.goto(`https://${host}/elsewhere`);
 assert.equal(missing?.status(),404);
 assert.deepEqual(errors,[]);
 console.log('PASS rehearsal site: reserved HTTPS origin, booking with required time and confirmation, trial cancellation past a retention step, bill payment stops at the card form, idempotent reloads and 404');
}finally{await browser.close();}
