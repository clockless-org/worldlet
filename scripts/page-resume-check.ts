// Shared "resume where I left off" rule for website Applets (core/browser/page-resume.ts).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_DEFINITIONS} from '../core/applets/index.ts';
import {BROWSER_HOME,appletHomeLanding,atAppletHome,browserHomePage,browserStartsHome,createBrowserHome} from '../core/browser/browser-home.ts';
import {BROWSER_BUDGET,PAGE_MEMORY,PAGE_RESUME,appletSite,browserBudget,memoryPressure,createPageMemory,livePagePlan,readBrowserBudget,resumablePage,sitePage} from '../core/browser/index.ts';

// Site-locked platforms: the Electron website panel decides these through the same core sitePage.
const vectors=JSON.parse(readFileSync('contracts/fixtures/parity/browser-applet-site.json','utf8')) as Record<string,{allowed:string[];refused:string[]}>;
let count=0;
for(const [platform,{allowed,refused}] of Object.entries(vectors)){
 for(const url of allowed){assert.equal(sitePage(platform,url),true,platform+' opens '+url);count++;}
 for(const url of refused){assert.equal(sitePage(platform,url),false,platform+' refuses '+url);count++;}
}

// Which Applets resume: those with a website of their own, never local or meeting-only Applets.
for(const key of ['youtube','netflix','x','tiktok','browser','gmail','notion','doordash'])assert.ok(appletSite(key),key+' has a website');
for(const key of ['meetings','weather','apple-notes','codex','nope'])assert.equal(appletSite(key),null,key+' has no website to resume');

// What is remembered: public HTTPS pages; site-locked Applets keep only their own site.
assert.equal(resumablePage('youtube','https://www.youtube.com/watch?v=abc&t=42'),'https://www.youtube.com/watch?v=abc&t=42');
assert.equal(resumablePage('youtube','https://www.google.com/'),null,'YouTube keeps only YouTube');
assert.equal(resumablePage('x','https://x.com/worldlet/status/1'),'https://x.com/worldlet/status/1');
assert.equal(resumablePage('netflix','https://www.netflix.com/title/80100172'),'https://www.netflix.com/title/80100172');
assert.equal(resumablePage('browser','https://news.example.com/a?b=c'),'https://news.example.com/a?b=c','a web Applet keeps pages the person reached from it');
for(const url of ['https://blog.example.com/blogindex','https://example.com/js/callbacks-explained','https://example.com/catalog-in-stock'])assert.equal(resumablePage('browser',url),url,'only sign-in path segments are skipped: '+url);
for(const [key,url] of [['netflix','http://www.netflix.com/browse'],['netflix','https://user:pw@www.netflix.com/'],['netflix','file:///etc/passwd'],['netflix','javascript:alert(1)'],
 ['netflix','https://www.netflix.com/login'],['browser','https://accounts.google.com/v3/signin/identifier'],['browser','https://example.com/oauth/authorize?code=1'],['x','https://x.com/i/flow/login'],
 ['browser','https://example.com:8443/'],['browser','https://example.com/auth/callback?code=1'],['browser','https://example.com/sso'],['netflix','https://www.netflix.com/Login?nextpage=%2Fbrowse'],['meetings','https://meet.google.com/abc-defg-hij'],['browser','https://example.com/'+'a'.repeat(PAGE_RESUME.maxURL)]])
 assert.equal(resumablePage(key,url),null,key+' never remembers '+url.slice(0,60));

// Memory: one page per Applet, separate per Applet, persisted, bounded, practice kept in memory.
const saved=new Map<string,string>(),storage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>void saved.set(k,v)};
const real=createPageMemory(storage);
assert.equal(real.remember('youtube','https://www.youtube.com/watch?v=a',1),true);
assert.equal(real.remember('netflix','https://www.netflix.com/title/1',2),true);
assert.equal(real.remember('youtube','https://www.google.com/',3),false,'an off-site page does not replace YouTube\'s');
assert.equal(real.remember('youtube','https://www.youtube.com/watch?v=a',4),false,'the same page is not rewritten');
const reopened=createPageMemory(storage);
assert.equal(reopened.get('youtube'),'https://www.youtube.com/watch?v=a','survives a restart');
assert.equal(reopened.get('netflix'),'https://www.netflix.com/title/1','each Applet keeps its own page');
reopened.forget('youtube');assert.equal(createPageMemory(storage).get('youtube'),null);
saved.set('worldlet-applet-pages-v1',JSON.stringify({version:1,pages:{youtube:{url:'https://evil.test/',at:1},x:{url:'https://x.com/home',at:2}}}));
const tampered=createPageMemory(storage);
assert.equal(tampered.get('youtube'),null,'stored pages are revalidated');assert.equal(tampered.get('x'),'https://x.com/home');
saved.set('worldlet-applet-pages-v1','{not json');assert.equal(createPageMemory(storage).get('x'),null,'unreadable memory starts empty');
const many=createPageMemory(storage),webKeys=APP_DEFINITIONS.map(app=>app.key).filter(key=>appletSite(key)?.platform==='web');
assert.ok(webKeys.length>PAGE_RESUME.remembered,'enough web Applets to exercise the bound');
webKeys.forEach((key,i)=>assert.equal(many.remember(key,'https://example.com/'+i,10+i),true));
const kept=Object.keys(JSON.parse(saved.get('worldlet-applet-pages-v1')).pages);
assert.equal(kept.length,PAGE_RESUME.remembered,'at most '+PAGE_RESUME.remembered+' Applets keep a page');
assert.ok(kept.includes(webKeys.at(-1))&&!kept.includes(webKeys[0]),'the least recently used page goes first');
const practice=createPageMemory(null),before=saved.get('worldlet-applet-pages-v1');
practice.remember('youtube','https://www.youtube.com/watch?v=practice',9);
assert.equal(practice.get('youtube'),'https://www.youtube.com/watch?v=practice');
assert.equal(saved.get('worldlet-applet-pages-v1'),before,'practice pages never write the real world\'s memory');

// Live hidden pages: the most recently left two, each for ten minutes.
const minute=60_000,now=100*minute;
assert.deepEqual(livePagePlan(new Map(),now),{live:[],nextCheck:null});
const plan=livePagePlan(new Map([['youtube',now-minute],['x',now-2*minute],['netflix',now-3*minute],['tiktok',now-11*minute]]),now);
assert.deepEqual(plan.live,['youtube','x'],'at most two, most recent first; expired pages go');
assert.equal(plan.nextCheck,now-2*minute+PAGE_RESUME.liveMs);
assert.deepEqual(livePagePlan(new Map([['x',now-PAGE_RESUME.liveMs]]),now).live,[]);

// Memory pressure: free memory below the smaller bound, or the app's footprint above its bound.
const gb=1024;
assert.equal(memoryPressure({freeMB:4*gb,totalMB:16*gb,appMB:gb}),null,'ample memory keeps pages');
assert.equal(memoryPressure({freeMB:600,totalMB:16*gb,appMB:gb}),null,'above 512 MB free on 16 GB');
assert.equal(memoryPressure({freeMB:500,totalMB:16*gb,appMB:gb}),'lowMemory');
assert.equal(memoryPressure({freeMB:300,totalMB:4*gb,appMB:gb}),null,'5% of 4 GB is the bound there');
assert.equal(memoryPressure({freeMB:4*gb,totalMB:16*gb,appMB:gb,pressure:'warn'}),'lowMemory','the system saying it is short wins over free memory');
assert.equal(memoryPressure({freeMB:4*gb,totalMB:16*gb,appMB:gb,pressure:'critical'}),'lowMemory');
assert.equal(memoryPressure({freeMB:4*gb,totalMB:16*gb,appMB:gb,pressure:'normal'}),null);
assert.equal(memoryPressure({freeMB:200,totalMB:4*gb,appMB:gb}),'lowMemory');
assert.equal(memoryPressure({freeMB:4*gb,totalMB:16*gb,appMB:PAGE_MEMORY.maxAppMB+1}),'appFootprint');
for(const reading of [null,{freeMB:NaN,totalMB:16*gb,appMB:NaN},{freeMB:0,totalMB:0,appMB:0},{freeMB:-1,totalMB:16*gb,appMB:0}])assert.equal(memoryPressure(reading),null,'an unreadable reading releases nothing');
// Budget (#1176): live pages and concurrent Fox browser tasks follow the machine's memory.
const GB=1024,reading=(totalGB:number,freeGB:number)=>({totalMB:totalGB*GB,freeMB:freeGB*GB,appMB:900});
assert.deepEqual(browserBudget(null),{livePages:PAGE_RESUME.livePages,foxTasks:1},'no reading: the earlier bound');
assert.deepEqual(browserBudget(reading(8,4)),{livePages:2,foxTasks:1});
assert.deepEqual(browserBudget(reading(16,8)),{livePages:4,foxTasks:2});
assert.deepEqual(browserBudget(reading(24,10)),{livePages:4,foxTasks:2},'24 GB is the 16 GB tier');
assert.deepEqual(browserBudget(reading(64,40)),{livePages:6,foxTasks:2});
assert.equal(browserBudget({totalMB:32*GB,freeMB:PAGE_MEMORY.minFreeMB+2*BROWSER_BUDGET.perPageMB,appMB:900}).livePages,2,'free memory holds two more pages');
assert.equal(browserBudget({totalMB:32*GB,freeMB:100,appMB:900}).livePages,1,'never fewer than one');
assert.deepEqual(readBrowserBudget({livePages:4,foxTasks:2}),{livePages:4,foxTasks:2});
for(const bad of [null,'4',{livePages:0,foxTasks:1},{livePages:7,foxTasks:1},{livePages:2.5,foxTasks:1},{livePages:2,foxTasks:3},{livePages:0,foxTasks:9}])
 assert.deepEqual(readBrowserBudget(bad),{livePages:PAGE_RESUME.livePages,foxTasks:1},'out of bounds is the earlier bound: '+JSON.stringify(bad));
const four=livePagePlan(new Map([['youtube',now-minute],['x',now-2*minute],['netflix',now-3*minute],['tiktok',now-4*minute],['twitch',now-5*minute]]),now,'bilibili',4);
assert.deepEqual(four.live,['bilibili','youtube','x','netflix'],'a budget of four: the window and the three most recent');
assert.deepEqual(livePagePlan(new Map([['x',now-minute]]),now,'youtube',1).live,['youtube'],'a budget of one: the window only');
console.log(`PASS browser budget by memory (live pages and Fox tasks) and its bounds`);
console.log(`PASS page resume: ${count} site vectors, Applet sites, remembered-page rules, per-Applet persistence, practice isolation, memory pressure and live-page bounds (${PAGE_RESUME.livePages} pages, ${PAGE_RESUME.liveMs/minute} min).`);
// The Browser's home page (core/browser/browser-home.ts, owner request 2026-10-06).
{
 const kept=new Map<string,string>(),store={getItem:(k:string)=>kept.get(k)??null,setItem:(k:string,v:string)=>{kept.set(k,v);}};
 const settings=createBrowserHome(store),panel=createBrowserHome(store);
 assert.equal(panel.get(),BROWSER_HOME.url,'Google until the person chooses another');
 assert.equal(settings.set('bing.com'),'https://bing.com/');assert.equal(panel.get(),'https://bing.com/','the panel reads what Settings saved');
 assert.equal(settings.set('not a page'),null);assert.equal(panel.get(),'https://bing.com/','an address that is not one changes nothing');
 assert.equal(settings.set(''),BROWSER_HOME.url);assert.equal(panel.get(),BROWSER_HOME.url,'cleared goes back to Google');
 assert.equal(browserHomePage('javascript:alert(1)'),null);assert.equal(browserHomePage('http://example.com/a'),'https://example.com/a');
 assert.equal(createBrowserHome(null).get(),BROWSER_HOME.url,'the practice world keeps nothing');
 const t=Date.UTC(2026,9,6,8);
 assert.equal(browserStartsHome(null,t),false,'never seen: nothing to resume anyway');
 assert.equal(browserStartsHome(t-BROWSER_HOME.idleMs+1000,t),false,'back within 30 minutes resumes');
 assert.equal(browserStartsHome(t-BROWSER_HOME.idleMs,t),true,'after 30 minutes away it starts home');
 const pages=createPageMemory(store);pages.remember('browser','https://example.com/read',t-60*60_000);
 assert.equal(pages.last('browser'),t-60*60_000);pages.seen('browser',t);assert.equal(pages.last('browser'),t,'leaving the page counts as last seen');
 console.log('PASS Browser home page: Google by default, Settings choice shared, invalid kept out, home after 30 minutes away');
}
// A website Applet's home page (owner request 2026-10-08): where Home shows and where it goes.
{
 const home=appletSite('xiaohongshu')?.url||'';
 assert.equal(home,'https://www.xiaohongshu.com/explore','小红书 opens at its explore page');
 assert.equal(atAppletHome('https://www.xiaohongshu.com/explore?channel_id=homefeed_recommend',[home]),true,'its query aside, the home page');
 assert.equal(atAppletHome('https://www.xiaohongshu.com/explore/',[home]),true,'a trailing slash is the same page');
 assert.equal(atAppletHome('https://www.xiaohongshu.com/explore/66f0',[home]),false,'a note is not home');
 assert.equal(atAppletHome('https://creator.xiaohongshu.com/login',[home]),false,'the reported page: Home shows');
 assert.equal(atAppletHome('https://x.com/home',['https://x.com/','https://x.com/home']),true,'where home first landed is home too');
 assert.equal(atAppletHome('not a page',[home]),false);assert.equal(atAppletHome('https://www.xiaohongshu.com/explore',['']),false);
 assert.equal(appletHomeLanding('https://x.com/','https://x.com/home'),'https://x.com/home');
 assert.equal(appletHomeLanding('https://discord.com/app','https://discord.com/channels/@me'),'https://discord.com/channels/@me');
 assert.equal(appletHomeLanding('https://www.xiaohongshu.com/explore','https://xiaohongshu.com/explore'),'https://xiaohongshu.com/explore','www aside, the same site');
 assert.equal(appletHomeLanding('https://www.xiaohongshu.com/explore','https://www.xiaohongshu.com/login?redirect=x'),null,'a sign-in page is never home');
 assert.equal(appletHomeLanding('https://www.xiaohongshu.com/explore','https://creator.xiaohongshu.com/'),null,'another site is never home');
 console.log('PASS website Applet home: its own address or where it landed, query aside; sign-in pages and other sites are not home');
}
