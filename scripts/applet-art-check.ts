// Pictures for the person's own Applets (core/applets/MY-APPLETS.md#pictures) without a host or a painter: which
// Applets may be painted, what the painter is told, which kept records are trusted, which Applets are painted next,
// and the World wearing a painted icon only on the person's own Applets.
import assert from 'node:assert/strict';
import {APPLET_ART_LIMITS,appletArtPrompt,artToPaint,codexArtTask,readAppletArt,readArtSubject,validArtApplet} from '../core/applets/index.ts';
import {projectNativeWorld} from '../ui/world/world-projection.ts';

for(const ok of ['app-site-0123456789ab','app-wgt-0123456789','app-job-0123456789ab'])assert.ok(validArtApplet(ok),ok);
for(const bad of ['app-gmail','app-site-../x','wgt-0123456789','app-wgt-012','app-job-0123456789ab/..',42,null])assert.ok(!validArtApplet(bad),String(bad));

const subject=readArtSubject({applet:'app-wgt-0123456789',title:'  Tahoe\n packing  ',about:'What to pack for the weekend at the lake'.repeat(10),kind:'page'})!;
assert.equal(subject.title,'Tahoe packing','whitespace is folded');
assert.ok(subject.about.length<=200,'what it is for is clipped');
assert.equal(readArtSubject({applet:'app-wgt-0123456789',title:'',kind:'page'}),null,'a subject has a name');
assert.equal(readArtSubject({applet:'app-gmail',title:'Gmail',kind:'site'}),null,'built-in Applets are not painted');
assert.equal(readArtSubject({applet:'app-wgt-0123456789',title:'X',kind:'game'}),null);

// The painter is asked for Worldlet's style, a tiny-readable icon, a quiet background and no words.
const icon=appletArtPrompt('icon',subject),background=appletArtPrompt('background',subject);
assert.match(icon,/square app icon for a small personal app called “Tahoe packing”/);assert.match(icon,/48 pixels/);
assert.match(background,/wide 16:9 background/);assert.match(background,/quiet, open middle/);
for(const words of [icon,background])assert.match(words,/No text, no letters, no numbers, no logos/);
assert.match(appletArtPrompt('icon',{...subject,kind:'site',title:'tldraw'}),/the website “tldraw”/);
assert.match(appletArtPrompt('icon',{...subject,kind:'conversation',title:'Move'}),/an ongoing project called “Move”/);
const task=codexArtTask(subject);
assert.ok(task.startsWith('$imagegen '),'Codex is asked through its image skill');
assert.match(task,/icon\.png \(square, 1024x1024\)/);assert.match(task,/background\.png \(wide, 1536x1024\)/);assert.match(task,/Do not read, write or delete any other file/);

// Kept records: two data images within their limits, for one of the person's own Applets.
const png='data:image/png;base64,iVBORw0KGgo=',jpeg='data:image/jpeg;base64,/9j/4AAQ';
const kept={applet:'app-wgt-0123456789',icon:png,background:jpeg,painter:'codex',madeAt:1_760_000_000};
assert.deepEqual(readAppletArt(kept),kept);
assert.equal(readAppletArt({...kept,painter:'cloud'}),null,'only the local painter');
assert.equal(readAppletArt({...kept,icon:'https://example.com/a.png'}),null,'no addresses');
assert.equal(readAppletArt({...kept,icon:'data:image/svg+xml;base64,PHN2Zz4='}),null,'raster only');
assert.equal(readAppletArt({...kept,icon:'data:image/png;base64,'+'A'.repeat(APPLET_ART_LIMITS.icon)}),null,'icon within its limit');
assert.equal(readAppletArt({...kept,background:'data:image/jpeg;base64,'+'A'.repeat(APPLET_ART_LIMITS.background)}),null,'background within its limit');
assert.equal(readAppletArt({...kept,applet:'app-gmail'}),null);

// What is painted next: not painted, not failed in the last day, once each, within the day's allowance.
const now=1_760_100_000,s=(n:number)=>({...subject,applet:'app-wgt-'+String(n).padStart(10,'0')});
const next=artToPaint([s(1),s(2),s(2),s(3),s(4)],{painted:new Set([s(1).applet]),attempts:[{applet:s(3).applet,failedAt:now-3600,reason:'x'},{applet:s(4).applet,failedAt:now-2*86400,reason:'x'}],paintedToday:0,now});
assert.deepEqual(next.map(a=>a.applet),[s(2).applet,s(4).applet],'painted and recently failed ones wait; an old failure is tried again');
assert.equal(artToPaint(Array.from({length:30},(_,i)=>s(i+10)),{painted:new Set(),attempts:[],paintedToday:0,now}).length,APPLET_ART_LIMITS.perDay);
assert.equal(artToPaint([s(5)],{painted:new Set(),attempts:[],paintedToday:APPLET_ART_LIMITS.perDay,now}).length,0,'none past the allowance');

// The World: a painted icon is worn by the person's own Applet it was painted for, never by a built-in one.
const moment={id:'wgt-0123456789',title:'Tahoe packing',blurb:'Pack',color:'#4f7a6a',endsAt:1_760_040_000,pinned:false,createdAt:1_760_000_000};
const world:any=projectNativeWorld({workspaceId:'applet-art-check',revision:1,sources:[],knowledge:[],onboarding:{completed:true,unlockedApplets:['app-gmail']},ongoing:[],worldItems:[],momentApplets:[moment],siteApplets:[],
 appletArt:{'app-wgt-0123456789':png,'app-gmail':png}});
assert.equal(world.spaces.find(s=>s.moduleId==='app-wgt-0123456789')?.icon,png,'the page Applet wears its painted icon');
assert.equal(world.spaces.find(s=>s.moduleId==='app-gmail')?.icon,undefined,'a built-in Applet does not');
const plain:any=projectNativeWorld({workspaceId:'applet-art-check',revision:1,sources:[],knowledge:[],onboarding:{completed:true,unlockedApplets:[]},ongoing:[],worldItems:[],momentApplets:[moment],siteApplets:[]});
assert.equal(plain.spaces.find(s=>s.moduleId==='app-wgt-0123456789')?.icon,undefined,'no pictures, no icon');
console.log('PASS Applet pictures: only the person\'s own Applets are painted, in Worldlet\'s style with no words, kept records are checked, painting waits on failures and the day\'s allowance, and the World wears the painted icon.');
