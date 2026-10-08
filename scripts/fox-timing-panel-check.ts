import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript,pageErrors} from './browser-test.ts';
// The timing report is a development tool; Settings no longer offers it (owner feedback 2026-10-03).
const bundle=await bundleScript({stdin:{resolveDir:process.cwd(),contents:`
import {createFoxSurfaceTiming,registerFoxFrameTiming,renderFoxFrameTiming} from './ui/companion/fox-frame-timing.ts';
const report=document.querySelector('#report'),button=document.querySelector('button'),canvas=document.querySelector('canvas');
button.onclick=()=>renderFoxFrameTiming(report);
const timing=createFoxSurfaceTiming(600);let time=0;
for(const surface of ['world','desktop'])for(const phase of ['handling','blend','performing','settled']){
 for(let i=0;i<10;i++){time+=phase==='handling'&&i===5?721:17;timing.record(time,phase==='performing'?4:3,time,'anatomy-v1:delighted',surface,phase);}
}timing.observe(0,'world',false,true);timing.observe(20,'world',false,false);timing.observe(30,'desktop',false,false);timing.pause();globalThis.attach=()=>registerFoxFrameTiming(canvas,timing);
`}});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=pageErrors(page,{console:true});
 await page.setContent('<title>Fox timing panel check</title><style>body{margin:24px;background:#f6f3eb;color:#243e35;font:14px/1.6 system-ui}button{font:inherit}#report{display:block;margin-top:16px}.companion-avatar{display:none}</style><button>Animation timing</button><span id="report" role="status"></span><div class="companion-avatar"><canvas class="companion-model"></canvas></div>');
 await page.addScriptTag({content:bundle});
 assert.equal(page.url(),'about:blank');assert.equal(await page.title(),'Fox timing panel check');
 await page.getByRole('button',{name:'Animation timing'}).click();
 assert.match(await page.locator('#report').innerText(),/no Dev samples/);
 await page.evaluate(()=>(globalThis as any).attach());
 await page.getByRole('button',{name:'Animation timing'}).click();
 const lines=await page.locator('#report > span').allTextContents();
 assert(lines.length>30);assert.equal(lines.filter(s=>s.startsWith('delighted / handling')).length,2);
 assert.equal(lines.filter(s=>s.includes('max 721.0 ms')).length,4);
 assert(lines.every(s=>s.length<500),'Native line exceeds text observation limit');
 assert(lines.some(s=>s.includes('Not uploaded')));
 assert(lines.some(s=>s.includes('document visible')&&s.includes('unfocused')));
 assert(lines.some(s=>s.includes('not native occlusion')));
 const ax=await page.locator('#report').ariaSnapshot();assert.match(ax,/delighted \/ handling/);assert.match(ax,/Desktop/);
 await page.screenshot({path:'/tmp/fox-timing-panel-wide.png',fullPage:true});
 await page.getByRole('button',{name:'Animation timing'}).click();
 assert.equal(await page.locator('#report > span').count(),lines.length,'Refresh appends stale summaries');
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow report overflows horizontally');
 await page.screenshot({path:'/tmp/fox-timing-panel-narrow.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS separate accessible phase rows, full 721ms handling evidence, World/Desktop, empty/refresh, bounded lines, no console errors; 900×700 and 390×844. Browser plugin not available; existing Playwright used.');
}finally{await browser.close();}
