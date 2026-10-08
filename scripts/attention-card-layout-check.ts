import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {bundleScript} from './browser-test.ts';
const bundle=await bundleScript({entryPoints:['ui/attention/attention-preview.ts'],globalName:'preview'});
const css=await readFile('ui/attention/attention-preview.css','utf8');
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('https://fixture.test/**',route=>route.fulfill({body:'',contentType:'text/html'}));
 await page.goto('https://fixture.test');
 await page.setContent('<style>:root{--ui-paper:#f9f4e4;--hud-paper-art:none;--hud-paper-ink:#294d43;--ui-text-body:16px;--ui-text-title:28px;--ui-text-label:14px;--ui-font-ui:Arial}body{margin:0;background:#486b65}#notionWorld{position:relative;height:100vh}'+css+'</style><main id="notionWorld" class="native-console"></main>');
 await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const root=document.querySelector('#notionWorld');let original=0;
  const card=(window as any).preview.mountAttentionPreview({root,onClose(){},onOriginal(_page,ref){original++;(window as any).originalCalls=original;((window as any).sourceCalls??=[]).push(ref.id);},onLink(){}});
  card.open({title:'Tennis with Sam',worldItemId:'tennis',worldItemKind:'event',worldItemSources:[{provider:'gmail',id:'one'},{provider:'google-calendar',id:'two'},{provider:'gmail',id:'three'},{provider:'notion',id:'four'},{provider:'file',id:'five'}],worldItemSignal:{reason:'Your court booking is confirmed.',start:'2026-09-29T10:00:00-07:00',end:'2026-09-29T11:00:00-07:00',locationName:'Riverside Tennis Courts',location:'Riverside Tennis Courts',summary:'Your tennis session with Sam is confirmed.\n\n- **Court 3** is reserved for you.\n- Bring **your racket and water**.'}});
  (window as any).card=card;
  card.setActions([{key:'done',label:'Got it',primary:true,run(){}},{key:'dismiss',label:'Dismiss',run(){}},{key:'later',label:'Later',run(){}}]);
 });
 // Use a real existing illustration through a route, without external network access.
 const art=page.locator('.attention-preview-art');
 const file=path.resolve('dist/WorldletWeb/attention/scene-tennis.webp');
 await page.route('https://fixture.test/art.webp',route=>route.fulfill({path:file}));await art.evaluate(e=>(e as HTMLImageElement).src='https://fixture.test/art.webp');
 await art.evaluate(e=>(e as HTMLImageElement).decode());
 for(const width of [1440,1100,600,360]){
  await page.setViewportSize({width,height:1000});
  const card=page.locator('#attentionPreview');
  assert.equal(await card.locator('.attention-preview-heading .attention-preview-facts').count(),1);
  assert.equal(await card.locator('.attention-preview-summary li').count(),2);
  assert.equal(await card.locator('.attention-preview-kind svg path').count(),1);
  assert.equal(await card.locator('.attention-preview-original').count(),5);
  assert.equal(await card.locator('.attention-preview-original').first().getAttribute('title'),'Open Mail · 1');
  assert.equal(await card.locator('.attention-preview-reason').count(),0);
  const sources=await card.locator('.attention-preview-source-group').boundingBox(),actions=await card.locator('.attention-preview-actions').boundingBox();
  assert(sources.x<=actions.x,'Sources lead the action group');
  assert(sources.y+sources.height<=actions.y+1||sources.x+sources.width<=actions.x,'Groups do not overlap');
  assert(await card.locator('.attention-preview-footer').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert(await card.evaluate(el=>{const summary=el.querySelector('.attention-preview-summary'),strong=summary.querySelector('strong');return getComputedStyle(summary).color===getComputedStyle(strong).color&&el.scrollWidth<=el.clientWidth+1;}));
  // The picture is the whole card's background under a paper scrim (owner Order 2026-10-08).
  const cover=await card.evaluate(el=>{const a=el.querySelector('.attention-preview-art')!.getBoundingClientRect(),s=el.querySelector('.attention-preview-scrim')!.getBoundingClientRect(),c=el.getBoundingClientRect();return [a,s].every(r=>Math.abs(r.left-c.left)<=1.5&&Math.abs(r.right-c.right)<=1.5&&Math.abs(r.top-c.top)<=1.5&&Math.abs(r.bottom-c.bottom)<=1.5);});
  assert(cover,`${width}: the picture and its scrim fill the card`);
  assert.equal(await art.evaluate(e=>getComputedStyle(e).maskImage),'none');
 }
 // An email's own picture replaces the illustration when it is large enough; a small one never does.
 const picture=(w:number,h:number)=>page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;const grad=g.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#1d6a8a');grad.addColorStop(1,'#e2a04a');g.fillStyle=grad;g.fillRect(0,0,w,h);return c.toDataURL('image/png');},[w,h]);
 const big=await picture(1200,600),small=await picture(120,60);
 const withPicture=async(image:string,src='https://cdn.example.test/hero.jpg')=>{
  await page.evaluate(([image,src])=>{const w=window as any;w.lookups=[];w.preview.setAttentionImageLookup((url:string)=>{w.lookups.push(url);return Promise.resolve({image});});
   w.card.open({title:'Tennis with Sam',worldItemId:'tennis',worldItemKind:'event',worldItemSources:[{provider:'gmail',id:'one',image:src}],worldItemSignal:{summary:'Court 3 is booked for you.'}});},[image,src]);
  await page.waitForTimeout(150);
  return page.evaluate(()=>({art:document.querySelector('#attentionPreview')!.getAttribute('data-art'),src:(document.querySelector('.attention-preview-art') as HTMLImageElement).src,lookups:(window as any).lookups}));
 };
 await page.setViewportSize({width:1440,height:1000});
 let shown=await withPicture(big);
 assert.equal(shown.art,'source');assert.equal(shown.src,big);assert.deepEqual(shown.lookups,['https://cdn.example.test/hero.jpg']);
 await page.locator('#attentionPreview').screenshot({path:'/tmp/worldlet-attention-card-email-picture.png'});
 shown=await withPicture(small);assert.equal(shown.art,'illustration','a small picture keeps the illustration');
 shown=await withPicture(big,'https://open.example.test/pixel.gif');assert.equal(shown.art,'illustration');assert.deepEqual(shown.lookups,[],'a tracking address is never read');
 await page.evaluate(()=>(window as any).preview.setAttentionImageLookup(null));
 await page.evaluate(()=>{(window as any).card.open({title:'Tennis with Sam',worldItemId:'tennis',worldItemKind:'event',worldItemSources:[{provider:'gmail',id:'one'},{provider:'google-calendar',id:'two'},{provider:'gmail',id:'three'},{provider:'notion',id:'four'},{provider:'file',id:'five'}],worldItemSignal:{reason:'Your court booking is confirmed.',start:'2026-09-29T10:00:00-07:00',end:'2026-09-29T11:00:00-07:00',locationName:'Riverside Tennis Courts',location:'Riverside Tennis Courts',summary:'Your tennis session with Sam is confirmed.\n\n- **Court 3** is reserved for you.\n- Bring **your racket and water**.'}});});
 await art.evaluate(e=>(e as HTMLImageElement).src='https://fixture.test/art.webp');await art.evaluate(e=>(e as HTMLImageElement).decode());
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#attentionPreview').screenshot({path:'/tmp/worldlet-attention-card-refined.png'});
 for(const button of await page.locator('.attention-preview-original').all())await button.click();
 assert.deepEqual(await page.evaluate(()=>(window as any).sourceCalls),['one','two','three','four','five']);
 // Missing sources and long saved summaries still leave all controls reachable.
 await page.setViewportSize({width:360,height:1000});
 await page.evaluate(()=>{(window as any).card.open({title:'A very long unbroken title for a card',worldItemId:'missing',worldItemKind:'task',worldItemSignal:{summary:'Supported details '.repeat(65)}});(window as any).card.setActions([{key:'done',label:'Done',primary:true,run(){}},{key:'dismiss',label:'Dismiss',run(){}},{key:'later',label:'Later',run(){}}]);});
 assert.equal(await page.locator('.attention-preview-original').count(),0);
 assert.equal(await page.locator('.attention-preview-action').count(),3);
 assert(await page.locator('#attentionPreview').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 // The card's height follows its content (#1217): the body never scrolls inside a small card.
 const findings={
  short:'Court 3 is booked for you.',
  medium:'Your tennis session with Sam is confirmed.\n\n- **Court 3** is reserved for you.\n- Bring **your racket and water**.',
  long:'Sam confirmed the booking and asked about the next weeks of practice.\n\n- **Court 3** is reserved from 10 to 11.\n- Bring **your racket and water**; parking is free before 10.\n- Sam asks whether you can stay for a second hour.',
  // Taller than the whole left of the window, where the card stands while Fox is in the right-hand column.
  oversized:'Supported details from the thread. '.repeat(120)
 };
 const show=(summary:string)=>page.evaluate(summary=>{const card=(window as any).card;card.open({title:'Tennis with Sam',worldItemId:'fit',worldItemKind:'task',worldItemSources:[{provider:'gmail',id:'one'}],worldItemSignal:{summary}});card.setActions([{key:'done',label:'Done',primary:true,run(){}},{key:'dismiss',label:'Dismiss',run(){}},{key:'later',label:'Later',run(){}}]);},summary);
 const measure=()=>page.locator('#attentionPreview').evaluate(el=>{const box=(e:Element)=>e.getBoundingClientRect(),summary=el.querySelector('.attention-preview-summary')!,style=getComputedStyle(el);return {card:box(el),actions:box(el.querySelector('.attention-preview-actions')!),scroll:summary.scrollHeight,client:summary.clientHeight,max:parseFloat(style.maxHeight),top:parseFloat(style.getPropertyValue('--attention-card-top')),anchor:parseFloat(style.bottom)};});
 const actionsVisible=(m:Awaited<ReturnType<typeof measure>>,height:number)=>m.actions.top>=m.card.top&&m.actions.bottom<=m.card.bottom+1&&m.actions.top>=0&&m.actions.bottom<=height&&m.actions.height>0;
 for(const [width,height] of [[1440,900],[1280,720]]){
  await page.setViewportSize({width,height});
  let previous=0;
  for(const size of ['short','medium','long']){
   await show(findings[size]);const m=await measure(),label=`${size} at ${width}×${height}`;
   assert(m.scroll<=m.client+1,`${label}: the summary shows whole (${m.scroll} > ${m.client})`);
   const atLimit=m.card.height>=m.max-1;
   if(size==='short')assert(!atLimit,`${label}: a short finding keeps a compact card`);
   // Below the limit the card grows with its content; at the limit the illustration band yields first.
   assert(m.card.height>previous||atLimit,`${label}: the card grows with its content`);previous=m.card.height;
   assert(Math.abs(m.card.bottom-(height-m.anchor))<=1,`${label}: the card grows upward from its anchor`);
   assert(m.card.top>=m.top-1,`${label}: the card stays below the window's top margin`);
   assert(actionsVisible(m,height),`${label}: actions stay visible`);
   if(size!=='short')await page.locator('#attentionPreview').screenshot({path:`/tmp/worldlet-attention-card-${size}-${width}x${height}.png`});
  }
  // The space available is the window top margin to the anchor, not a fixed reserve.
  await show(findings.oversized);const m=await measure();
  assert(Math.abs(m.max-(height-m.top-m.anchor))<=1,'The limit is the space from the top margin to the anchor');
  assert(m.scroll>m.client+1,'Only a finding taller than the available space scrolls');
  assert(m.card.height<=m.max+1&&m.card.top>=m.top-1,'An oversized finding fills the available space and no more');
  assert(m.client>=24,'An oversized finding keeps its body readable');
  assert(actionsVisible(m,height),'Actions stay visible on an oversized finding');
 }
 // Short and narrow windows keep the card on screen with its actions reachable.
 for(const [width,height] of [[1280,600],[600,900],[360,640]]){
  await page.setViewportSize({width,height});await show(findings.long);const m=await measure();
  assert(m.card.top>=0&&m.card.bottom<=height,`${width}×${height}: the card stays on screen`);
  assert(actionsVisible(m,height),`${width}×${height}: actions stay visible`);
 }
 console.log('PASS header facts, structured body, neutral emphasis, source footer and full-card picture with scrim at four widths');
 console.log('PASS an email picture replaces the illustration only when large enough and never from a tracking address');
 console.log('PASS card height follows short, medium and long findings at 1440×900 and 1280×720; only an oversized finding scrolls');
}finally{await browser.close();}
