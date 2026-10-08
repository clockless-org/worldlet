// The audio corner is one icon and what is playing beside it. The icon wears the
// face of the sound itself -- waves, rain, trees, open air, a note for music, a
// microphone for a spoken programme -- and carries the same colour and halo as the
// HUD text: primary while playing, secondary while off. Nothing opens, expands or
// moves the clock and the date beside it, and a station still connecting never
// reads as playing.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.audio={ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped',track:'Internet radio',source:'radio',volume:.24}};
  window.fixture={workspaceId:'world-audio',revision:0,activityRevision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},
   connections:[],sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
  window.sent=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){window.sent.push(b);
   if(b.action==='snapshot')return structuredClone(fixture);
   if(b.action==='worldAudio'){if(b.operation==='ambience'||b.operation==='music'){const c=audio[b.operation];c.state=b.enabled?'playing':'paused';if(b.enabled&&!(c.volume>0))c.volume=.24;}if(b.operation==='podcast'){audio.music={state:'playing',volume:.24,track:'The Daily',kind:'podcast'};}if(b.operation==='presentation'){const id=b.track.split(':').at(-1),names={'black-lake':'Black Lake','hearth-embers':'Common Room Hearth','floating-candles':'Castle Halls','greenhouse-fireflies':'Greenhouses'};if(names[id]||audio.ambience.trackID.startsWith('theme:')){audio.ambience.track=names[id]||'Village Air';audio.ambience.trackID=b.track;}audio.ambience.suspended=b.track.startsWith('theme:')&&!b.active;}if(b.track&&b.operation!=='presentation'){audio.ambience.trackID=b.track;audio.ambience.track=b.track;}return structuredClone(audio);}
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='weatherLocate')return {latitude:37.7749,longitude:-122.4194,accuracy:100,timezone:'America/Los_Angeles',name:'Current location'};
   if(b.action==='weatherRequest')return {current:{time:Math.floor(Date.now()/1000),temperature_2m:18,weather_code:0,cloud_cover:5,wind_speed_10m:4,wind_direction_10m:0,is_day:1},daily:{sunrise:[],sunset:[]},timezone:'America/Los_Angeles'};
   return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 const row=page.locator('.world-audio'),sound=row.locator('.world-audio-current');
 await sound.waitFor();
 const weather=page.locator('#worldWeather');
 const clockGroup=page.locator('.world-date-time');
 await clockGroup.waitFor();
 const face=()=>page.evaluate(()=>document.querySelector<HTMLElement>('.world-audio-current svg')?.outerHTML||'');
 const push=value=>page.evaluate(v=>{Object.assign(window.audio,v);window.dispatchEvent(new CustomEvent('worldlet:audio',{detail:structuredClone(window.audio)}));},value);

 // One icon and one name: two toggles described the plumbing, not the sound, and a
 // row that opened on hover moved the clock and the date beside it.
 assert.equal(await row.locator('button').count(),1,'one sound toggle without a type chooser');
 assert.equal(await row.locator('.world-audio-menu').count(),0,'the sound status never opens a chooser');
 assert.equal((await row.innerText()).trim(),'Village Air','what is playing is named beside its icon, always');

 // Weather is the HUD's one control: it asks for a location, then opens the forecast.
 assert.equal(await weather.evaluate(element=>element.tagName),'BUTTON','weather opens location and forecast');
 assert.equal((await weather.innerText()).trim(),'Check weather','an unset location does not invent a forecast');
 assert.deepEqual(await page.locator(':is(.world-environment,.world-today) [title]').evaluateAll(list=>list.map(e=>e.id)),['worldWeather'],'only the weather control carries a tooltip');

 // Date and time are a single unit heading the Attention Center on the left (owner request 2026-10-08), and a click
 // on them opens today's plan in the Journal. The sound stands under them: a long station name scrolls inside its
 // own button and never moves the date.
 const clockBefore=await clockGroup.evaluate(group=>{
  const date=group.querySelector<HTMLElement>('#worldDate')!.getBoundingClientRect();
  const time=group.querySelector<HTMLElement>('#worldClock')!.getBoundingClientRect();
  const sound=document.querySelector<HTMLElement>('.world-audio')!.getBoundingClientRect();
  return {dateRight:Math.round(date.right),timeLeft:Math.round(time.left),timeRight:Math.round(time.right),dateLeft:Math.round(date.left),soundTop:Math.round(sound.top),dateBottom:Math.round(date.bottom),soundInToday:!!document.querySelector('.world-today .world-audio'),inToday:!!group.closest('.world-today-open')};
 });
 assert.ok(clockBefore.dateRight<=clockBefore.timeLeft+1,'the date stays immediately to the left of the clock');
 assert.ok(clockBefore.inToday&&clockBefore.dateLeft<200&&clockBefore.soundInToday&&clockBefore.soundTop>clockBefore.dateBottom,'the date heads the left column and the sound stands under it (owner request 2026-10-08): '+JSON.stringify(clockBefore));
 assert.equal(await page.getByRole('button',{name:'Journal: open today’s page'}).count(),1,'the date opens today’s plan');
 await page.getByRole('button',{name:'Journal: open today’s page'}).click();
 await page.locator('#journalBook').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('#journalBook').waitFor({state:'hidden'});
 await push({music:{state:'playing',track:'A very long radio station name that must scroll instead of moving the date and clock',source:'radio',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-now')?.dataset.scroll==='true');
 const clockAfter=await clockGroup.evaluate(group=>{
  const date=group.querySelector<HTMLElement>('#worldDate')!.getBoundingClientRect();
  const time=group.querySelector<HTMLElement>('#worldClock')!.getBoundingClientRect();
  return {dateRight:Math.round(date.right),timeLeft:Math.round(time.left),timeRight:Math.round(time.right)};
 });
 assert.deepEqual(clockAfter,{dateRight:clockBefore.dateRight,timeLeft:clockBefore.timeLeft,timeRight:clockBefore.timeRight},'a long sound name cannot move the date or clock');
 await push({ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped',track:'Internet radio',source:'radio',volume:.24}});

 // The icon is the sound. Each of these is a different drawing, not a relabelling.
 const faces: Record<string,any>={};
 for(const [id,track] of [['village','Village Air'],['ocean','Ocean Shore'],['rain','Soft Rain'],['forest','Forest Air']]){
  await push({ambience:{state:'playing',track,trackID:id,volume:.18}});
  await page.waitForFunction(t=>document.querySelector<HTMLElement>('.world-audio-current')?.getAttribute('aria-label')?.startsWith(t),track);
  faces[id]=await face();
 }
 await push({music:{state:'playing',track:'Internet radio',source:'radio',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.channel==='music');
 faces.music=await face();
 assert.equal(await sound.getAttribute('data-channel'),'music','music playing over ambience is the sound you would name');
 await push({music:{state:'playing',track:'The Daily',source:'podcast',kind:'podcast',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.getAttribute('aria-label')?.startsWith('The Daily'));
 faces.podcast=await face();
 // A podcast is the music channel wearing a different face, and it is named too.
 assert.equal((await row.innerText()).trim(),'The Daily','a podcast is named beside its microphone');
 assert.equal(new Set(Object.values(faces)).size,Object.keys(faces).length,
  'each sound wears its own face, not the same glyph relabelled: '+JSON.stringify(Object.keys(faces)));
 await push({ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped',track:'Internet radio',source:'radio',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.channel==='ambience');

 // A playing channel is the same colour as the clock beside it; an off one is the secondary colour.
 const clockInk=await page.evaluate(()=>getComputedStyle(document.querySelector<HTMLElement>('#worldClock')).color);
 assert.equal(await sound.evaluate(b=>getComputedStyle(b).color),clockInk,'sound that is playing shares the HUD text colour');
 assert.equal(await sound.evaluate(b=>getComputedStyle(b).opacity),'1','sound that is playing is at full strength');
 await push({ambience:{state:'stopped',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped'}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.on==='false');
 // Off is greyer and slashed, never faded: a faded line loses its halo and vanishes
 // over a bright sky (#1841).
 assert.notEqual(await sound.evaluate(b=>getComputedStyle(b).color),clockInk,'silence is not the primary colour');
 assert.equal(await sound.evaluate(b=>getComputedStyle(b).opacity),'1','silence stays readable over a bright sky');
 assert.notEqual(await sound.evaluate(b=>getComputedStyle(b.querySelector('.world-audio-icon'),'::after').content),'none','silence slashes its icon');
 // Weather is disabled while the scene is presented, and still reads at the clock's strength.
 assert.equal(await weather.evaluate(b=>{(b as HTMLButtonElement).disabled=true;const o=getComputedStyle(b).opacity;(b as HTMLButtonElement).disabled=false;return o;}),'1','presented weather is not faded');
 await push({ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.on==='true');

 // Nothing in the row moves. A playing icon that bounces is a distraction, not a status.
 const bundled=await readFile(path.resolve('dist/WorldletWeb/worldlet-ui.css'),'utf8');
 assert.doesNotMatch(bundled,/@keyframes world-audio-(?:breeze|beat)/,'no bounce or beat animation exists for the audio icons');

 // The icons wear the same halo the HUD text wears, not a filter of their own.
 const halo=await page.evaluate(()=>{
  const value=getComputedStyle(document.querySelector<HTMLElement>('#notionWorld')).getPropertyValue('--ui-hud-glyph-shadow').trim();
  if(!value)return null;
  const probe=document.createElement('span');probe.style.filter=value;document.body.append(probe);
  const computed=getComputedStyle(probe).filter;probe.remove();return computed;
 });
 assert.ok(halo&&halo!=='none','the HUD halo is defined once as a filter');
 assert.equal(await sound.evaluate(b=>getComputedStyle(b.querySelector('svg')).filter),halo,'the icon carries the HUD halo');

 // Nothing in the row is underlined, on or off.
 assert.equal(await sound.evaluate(b=>getComputedStyle(b).textDecorationLine),'none','the sound control is never underlined');

 // Hover is what names the source; a channel that is off offers the way to start it.
 // Nothing moves when the pointer arrives. The corner shares its line with the
 // clock and the date, and a control that grew on hover pushed both of them along.
 const resting=await sound.evaluate(b=>{const i=b.querySelector('.world-audio-icon').getBoundingClientRect(),
  n=b.querySelector('.world-audio-now').getBoundingClientRect(),d=document.querySelector<HTMLElement>('#worldDate').getBoundingClientRect();
  return {icon:Math.round(i.left),iconRight:Math.round(i.right),name:Math.round(n.left),date:Math.round(d.left)};});
 assert.ok(resting.name>=resting.iconRight-1,'the name reads to the right of its icon: '+JSON.stringify(resting));
 await sound.hover();
 await page.waitForTimeout(250);
 const hovered=await sound.evaluate(b=>{const i=b.querySelector('.world-audio-icon').getBoundingClientRect(),
  n=b.querySelector('.world-audio-now').getBoundingClientRect(),d=document.querySelector<HTMLElement>('#worldDate').getBoundingClientRect();
  return {icon:Math.round(i.left),iconRight:Math.round(i.right),name:Math.round(n.left),date:Math.round(d.left)};});
 assert.deepEqual(hovered,resting,'the corner moved under the pointer: '+JSON.stringify({resting,hovered}));
 assert.equal((await sound.innerText()).trim(),'Village Air','what is playing stays named, pointer or no pointer');
 await push({ambience:{state:'stopped',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped'}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.on==='false');
 assert.equal((await sound.innerText()).trim(),'Village Air','muted sound keeps its name without on/off text');

 // A connecting station is honest: it is not yet playing.
 await push({music:{state:'loading',track:'Internet radio',source:'radio',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.getAttribute('aria-busy')==='true');
 await sound.hover();
 assert.equal((await sound.innerText()).trim(),'Connecting…','a station that is still connecting says so');
 assert.doesNotMatch(await sound.getAttribute('aria-label'),/ playing\./,'connecting is not announced as playing');

 // Once it really plays, the station is named and the colour matches the clock.
 await push({music:{state:'playing',track:'Chillout Lounge FM',source:'radio',volume:.24}});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.world-audio-current')?.dataset.on==='true');
 await sound.hover();
 assert.equal((await sound.innerText()).trim(),'Chillout Lounge FM','music names the station it reached');
 assert.equal(await sound.evaluate(b=>getComputedStyle(b).color),clockInk);
 assert.match(await sound.getAttribute('aria-label'),/Chillout Lounge FM/,'the station is in the accessible name too');

 // Toggle the complete mix without selecting another track or opening a menu.
 await push({ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'playing',track:'Chillout Lounge FM',volume:.24}});
 await page.evaluate(()=>window.sent=[]);
 await sound.click();
 await page.waitForFunction(()=>document.querySelector('.world-audio-current').getAttribute('aria-pressed')==='false');
 assert.equal((await sound.innerText()).trim(),'Chillout Lounge FM');
 await sound.click();
 await page.waitForFunction(()=>document.querySelector('.world-audio-current').getAttribute('aria-pressed')==='true');
 assert.deepEqual(await page.evaluate(()=>window.sent.filter(s=>s.action==='worldAudio').map(({operation,enabled,track})=>({operation,enabled,...(track?{track}:{})}))),[
  {operation:'music',enabled:false},{operation:'ambience',enabled:false},
  {operation:'music',enabled:true},{operation:'ambience',enabled:true}
 ]);
 await weather.click({force:true});
 await page.waitForFunction(()=>window.sent.some(s=>s.action==='weatherLocate'));
 assert.equal(await row.locator('.world-audio-menu').count(),0);
 assert.equal(await page.locator('.world-weather-menu').count(),0);
 await push({ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped'}});

 // Moving away changes nothing, because nothing opened.
 await page.locator('#notionWorld').hover({position:{x:20,y:600}});
 await page.waitForTimeout(250);
 assert.equal((await row.innerText()).trim(),'Village Air','the selected environment sound stays active when the pointer leaves');

 await page.setViewportSize({width:900,height:730});await page.waitForTimeout(250);
 const box=await sound.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=900&&box.y>=0,'compact sound control remains in view');
 assert.equal(new URL(page.url()).pathname,new URL(worldUrl()).pathname);assert(await page.title());assert(await page.locator('#notionWorld canvas[data-renderer]').isVisible());assert((await page.locator('body').innerText()).includes('Village Air'));
 assert.deepEqual(errors,[]);
 console.log('PASS world HUD: sound toggles the current mix without type changes or on/off text; weather asks for a location; the compact control stays in view.');
});
