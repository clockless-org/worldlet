// Website Applets made from the Browser (core/applets/site-applet.ts) without a host: which pages qualify, the site's
// name taken from the page title, the record's checks, one Applet per site, and the World placing each made one on
// the Home ground, unlocked at once, with its own page and icon.
import assert from 'node:assert/strict';
import {APP_DEFINITIONS,isMyApplet,momentApplet,myAppletKind,readSiteApplet,siteApplet,siteAppletFor,siteAppletName,siteAppletPage,siteAppletRecord,validSiteAppletId} from '../core/applets/index.ts';
import {projectNativeWorld} from '../ui/world/world-projection.ts';

for(const bad of ['http://example.com/','https://localhost/','https://127.0.0.1/','https://user:pw@example.com/','https://example.com:8443/','https://example.com/login','https://example.com/oauth/authorize','file:///x','not a url'])
 assert.equal(siteAppletPage(bad),null,bad);
assert.equal(siteAppletPage('https://excalidraw.com/#room=1')?.href,'https://excalidraw.com/','the fragment is dropped');
const name=(title:string,url:string)=>siteAppletName(title,new URL(url));
assert.equal(name('Excalidraw | Hand-drawn look & feel','https://excalidraw.com/'),'Excalidraw');
assert.equal(name('Inbox - Superhuman','https://mail.superhuman.com/'),'Superhuman');
assert.equal(name('Dashboard · Vercel','https://vercel.com/team'),'Vercel');
assert.equal(name('','https://www.tldraw.com/'),'Tldraw','no title: the host');
assert.equal(name('A very long page title that says nothing about the site at all','https://www.tldraw.com/'),'Tldraw');
assert.equal(name('Figma','https://www.figma.com/files'),'Figma');

const icon='data:image/png;base64,iVBORw0KGgo=';
const record=siteAppletRecord({url:siteAppletPage('https://www.tldraw.com/r/abc')!,title:'My board — tldraw',icon},{id:'site-0123456789ab',now:1_760_000_000});
assert.deepEqual([record.title,record.url,record.host,record.icon],['tldraw','https://www.tldraw.com/r/abc','tldraw.com',icon]);
assert.equal(siteAppletRecord({url:new URL('https://a.example/'),title:'A',icon:'data:image/svg+xml;base64,PHN2Zz4='},{id:'site-0123456789ab',now:1}).icon,'','only raster icons are kept');
assert.ok(validSiteAppletId(record.id)&&!validSiteAppletId('site-../x')&&!validSiteAppletId('wgt-abc'));
assert.deepEqual(readSiteApplet(record),record);
assert.equal(readSiteApplet({...record,url:'http://tldraw.com/'}),null);
assert.equal(readSiteApplet({...record,id:'other'}),null);
assert.equal(siteAppletFor([record],'https://tldraw.com/other')?.id,record.id,'one Applet per site, www or not');
assert.equal(siteAppletFor([record],'https://example.com/'),null);

const app=siteApplet(record);
assert.deepEqual([app.id,app.key,app.region,app.fullView,app.art,app.icon,app.site.host],['app-site-0123456789ab','site-0123456789ab','home',{kind:'web',url:'https://www.tldraw.com/r/abc',platform:'web'},'browser',icon,'tldraw.com']);
const moment={id:'wgt-0123456789',title:'Tahoe packing',blurb:'Pack',color:'#4f7a6a',endsAt:1_760_040_000,pinned:false,createdAt:1_760_000_000};
const world:any=projectNativeWorld({workspaceId:'site-applet-check',revision:1,sources:[],knowledge:[],onboarding:{completed:true,unlockedApplets:['app-gmail'],hiddenApplets:[app.id]},ongoing:[],worldItems:[],momentApplets:[moment],
 siteApplets:[record,{...record,id:'site-bad',url:'http://x'}]});
const space=world.spaces.find(s=>s.moduleId===app.id);
assert.ok(space,'the made Applet is in the World');
assert.equal(world.spaces.filter(s=>s.site).length,1,'an invalid record is skipped');
assert.equal(space.buildingId,'building-home');
assert.ok(world.unlockedApplets.includes(app.id)&&!world.hiddenApplets.includes(app.id),'it stands in the World at once');
// The person's own Applets carry their kind (core/applets/MY-APPLETS.md); the catalog's never do.
assert.equal(myAppletKind(app),'site');assert.equal(myAppletKind(momentApplet(moment)),'page');
assert.equal(space.mine,'site','the World keeps the mark');assert.equal(world.spaces.find(s=>s.moduleId==='app-'+moment.id)?.mine,'page');
assert.ok(APP_DEFINITIONS.every(a=>!isMyApplet(a)),'no catalog Applet is the person\'s own');
assert.equal(myAppletKind({mine:'other'}),null);
console.log('PASS site Applets: public pages only, site names from titles, record checks, one per site, placed on the Home ground at once, marked as the person\'s own.');
