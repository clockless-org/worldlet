// The Browser's tabs (core/browser/browser-tabs.ts, owner request 2026-10-07).
import assert from 'node:assert/strict';
import {BROWSER_TABS,activeTab,addTab,browserTabsStart,closeTab,createBrowserTabs,isBrowserTab,noteTabPage,readBrowserTabs,selectTab,stepTab,tabApplet,tabLabel,pageAddress} from '../core/browser/index.ts';
import {readBrowserSurfaceRequest} from '../contracts/browser-surface.ts';

const home='https://www.google.com/',keys=(state:{tabs:{key:string}[]})=>state.tabs.map(tab=>tab.key);

// Keys: the first tab is the Browser's own page key; the others are Applet-like keys the surface contract accepts.
assert.ok(isBrowserTab('browser')&&isBrowserTab('browser--2')&&isBrowserTab('browser--12'));
for(const key of ['browser--1','browser--0','browser-2','browser--100','youtube','x--2',''])assert.equal(isBrowserTab(key),false,key);
assert.equal(tabApplet('browser--3'),'browser');assert.equal(tabApplet('youtube'),'youtube');
assert.deepEqual((readBrowserSurfaceRequest({action:'browserShow',rect:{x:0,y:0,width:10,height:10},platform:'web',applet:'browser--2',resume:true,live:['browser','browser--8']}) as {live?:string[]}).live,['browser','browser--8']);

// Add: at the end, active, home page, up to the bound.
let state=browserTabsStart(home);
assert.deepEqual(keys(state),['browser']);assert.equal(state.active,'browser');
state=addTab(state,home);state=addTab(state,home);
assert.deepEqual(keys(state),['browser','browser--2','browser--3']);assert.equal(state.active,'browser--3');assert.equal(activeTab(state).url,home);
let full=state;while(full.tabs.length<BROWSER_TABS.max)full=addTab(full,home);
assert.equal(full.tabs.length,8);assert.equal(addTab(full,home),full,'no ninth tab');
// A link opened for a new tab: at the end, in front, or behind the active tab for a background click.
const link='https://hotels.example.com/sf';
assert.deepEqual([addTab(state,link).active,activeTab(addTab(state,link)).url],['browser--4',link]);
assert.deepEqual([addTab(state,link,true).active,addTab(state,link,true).tabs.at(-1)],['browser--3',{key:'browser--4',url:link,title:''}]);

// Select and step round the ends.
assert.equal(selectTab(state,'browser--2').active,'browser--2');assert.equal(selectTab(state,'nope'),state);
assert.equal(stepTab(state,1).active,'browser','next after the last is the first');
assert.equal(stepTab(selectTab(state,'browser'),-1).active,'browser--3','previous before the first is the last');

// Close: the active tab hands over to its right, else its left; another tab leaves the active one; the last leaves a fresh one.
const middle=selectTab(state,'browser--2');
assert.equal(closeTab(middle,'browser--2',home).active,'browser--3','the right-hand neighbour');
assert.equal(closeTab(state,'browser--3',home).active,'browser--2','the last tab hands over to its left');
assert.equal(closeTab(middle,'browser',home).active,'browser--2','closing another tab keeps the active one');
const freed=closeTab(closeTab(state,'browser',home),'browser--2',home);
assert.deepEqual(keys(addTab(freed,home)),['browser--3','browser'],'a freed key is used again');
const last=closeTab(browserTabsStart(home),'browser',home);
assert.equal(last.tabs.length,1);assert.equal(activeTab(last).url,home);assert.notEqual(last.active,'browser','a fresh page, not the closed one');
assert.equal(closeTab(state,'nope',home),state);

// Pages: the person's addresses are remembered (public HTTPS, not sign-in); titles label the tab; Fox's pages only retitle it.
let noted=noteTabPage(state,'browser--2',{url:'https://flights.example.com/search?to=SFO',title:'  Flights   to SFO '});
assert.deepEqual(noted.tabs[1],{key:'browser--2',url:'https://flights.example.com/search?to=SFO',title:'Flights to SFO'});
assert.equal(noteTabPage(noted,'browser--2',{url:'https://accounts.google.com/v3/signin'}).tabs[1].url,'https://flights.example.com/search?to=SFO','sign-in pages are not reopened');
assert.equal(noteTabPage(noted,'browser--2',{url:'https://fox.example.com/',title:'Fox page'},false).tabs[1].url,'https://flights.example.com/search?to=SFO','a page Fox opened is not remembered');
assert.equal(noteTabPage(noted,'browser--2',{url:'https://flights.example.com/search?to=SFO',title:'Flights to SFO'}),noted,'unchanged is the same state');
assert.equal(noteTabPage(noted,'browser--2',{title:'x'.repeat(200)}).tabs[1].title.length,BROWSER_TABS.maxTitle);
assert.equal(tabLabel(noted.tabs[1]),'Flights to SFO');
assert.equal(tabLabel({key:'browser',url:'https://www.hotels.example.com/rooms',title:''}),'hotels.example.com','no title: the site');
assert.equal(tabLabel({key:'browser',url:'',title:''}),'New tab');
// The page's address as the top bar reveals it (owner request 2026-10-08).
assert.equal(pageAddress('https://x.com/home'),'x.com/home');
assert.equal(pageAddress('https://www.youtube.com/'),'youtube.com','no www. or lone slash');
assert.equal(pageAddress('https://www.youtube.com/watch?v=bar#t=3'),'youtube.com/watch?v=bar#t=3');
assert.equal(pageAddress('http://localhost:8080/a/'),'localhost:8080/a/');
assert.equal(pageAddress('https://zh.wikipedia.org/wiki/%E7%8B%90'),'zh.wikipedia.org/wiki/狐','readable characters');
assert.equal(pageAddress('https://example.com/%E0%A4%A'),'example.com/%E0%A4%A','a broken escape stays as it is');
assert.equal(pageAddress('about:blank'),'about:blank');

// Stored tabs are revalidated.
assert.equal(readBrowserTabs(null,home),null);assert.equal(readBrowserTabs({tabs:[]},home),null);
const read=readBrowserTabs({tabs:[{key:'browser--2',url:'https://a.example.com/',title:'A'},{key:'browser--2',url:'https://dup.example.com/'},{key:'evil',url:'https://b.example.com/'},{key:'browser',url:'javascript:alert(1)',title:7}],active:'gone'},home)!;
assert.deepEqual(read,{tabs:[{key:'browser--2',url:'https://a.example.com/',title:'A'},{key:'browser',url:home,title:'7'}],active:'browser--2'});
assert.equal(readBrowserTabs({tabs:Array.from({length:12},(_,i)=>({key:i?'browser--'+(i+1):'browser',url:home}))},home)!.tabs.length,BROWSER_TABS.max);

// Persistence: on this device, the practice world in memory only, the Browser's one remembered page as the first tab once.
const saved=new Map<string,string>(),storage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>void saved.set(k,v)};
const first=createBrowserTabs(storage,()=>home,{url:'https://news.example.com/a',at:5});
assert.equal(first.active().url,'https://news.example.com/a','the earlier remembered page is the first tab');assert.equal(first.last(),5);
first.add();first.note('browser--2',{url:'https://hotels.example.com/',title:'Hotels'});first.seen(9);
const again=createBrowserTabs(storage,()=>home,{url:'https://ignored.example.com/',at:1});
assert.deepEqual(keys(again.state),['browser','browser--2']);assert.equal(again.active().title,'Hotels');assert.equal(again.last(),9,'survives a restart');
again.forget('browser--2');assert.equal(again.get('browser--2')!.url,home,'a page that no longer opens goes back home');
assert.deepEqual(again.reset(),['browser','browser--2']);assert.deepEqual(keys(createBrowserTabs(storage,()=>home).state),['browser'],'after the idle time away: one home tab');
saved.set('worldlet-browser-tabs-v1','{not json');assert.deepEqual(keys(createBrowserTabs(storage,()=>home).state),['browser'],'unreadable tabs start again');
const before=saved.get('worldlet-browser-tabs-v1'),practice=createBrowserTabs(null,()=>home);practice.add();practice.seen();
assert.equal(practice.state.tabs.length,2);assert.equal(saved.get('worldlet-browser-tabs-v1'),before,'the practice world never writes the real tabs');
console.log(`PASS Browser tabs: keys the surface accepts, add up to ${BROWSER_TABS.max}, select and step, close hand-over and the last tab, remembered addresses and labels, stored tabs revalidated, practice isolation`);

// Website downloads go straight into Downloads with no save dialog; a taken name gets a number.
{
 const {downloadPath}=await import('../platform/electron/src/modules/browser/download-path.ts');
 // The folder's own separator: \ on Windows (Windows RC 2026.1007.3135).
 const {join}=await import('node:path'),d=(name:string)=>join('/d',name);
 const taken=new Set([d('report.pdf'),d('report (1).pdf'),d('download')]);
 const has=(file:string)=>taken.has(file);
 assert.equal(downloadPath('/d','report.pdf',has),d('report (2).pdf'));
 assert.equal(downloadPath('/d','../../etc/notes.txt',has),d('notes.txt'),'only the name is kept');
 assert.equal(downloadPath('/d','',has),d('download (1)'));
 assert.equal(downloadPath('/d','.bashrc',has),d('.bashrc'));
 console.log('PASS website downloads save straight into Downloads under a free name');
}
