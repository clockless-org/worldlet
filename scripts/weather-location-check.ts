import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
declare global {var WeatherFixture:any;}

await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({stdin:{contents:`export {mountWorldEnvironment} from './ui/world/world-environment.ts';export {createWorldToolRuntime} from './platform/bridge/world-tool-runtime.ts';`,resolveDir:process.cwd()},globalName:'WeatherFixture'});
 await page.route('https://weather-check.invalid/',route=>route.fulfill({contentType:'text/html',body:'<main><div class="notion-top"></div></main>'}));
 await page.goto('https://weather-check.invalid/');await page.addScriptTag({content:bundle});
 const results=await page.evaluate(async()=>{
  const check=(ok,label)=>{if(!ok)throw Error(label);};const clone=x=>JSON.parse(JSON.stringify(x));
  const cities=[{name:'Paris',admin1:'Île-de-France',country:'France',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'},{name:'Paris',admin1:'Texas',country:'United States',latitude:33.66,longitude:-95.55,timezone:'America/Chicago'}];
  const forecast=()=>({timezone:'Europe/Paris',current:{time:Math.floor(Date.now()/1000),temperature_2m:18,weather_code:0,is_day:1},daily:{sunrise:[],sunset:[]}});
  let saved:any={},located=0,requests=[],failSave=false,failForecast=false,heldSearch=null,heldForecast=null,releaseSearch,releaseForecast;
  const adapter:any={load:async()=>clone(saved),save:async value=>{if(failSave)throw Error('disk full');saved=clone(value);},locate:async()=>{located++;throw Error('Unexpected device access');},request:async(op,args)=>{
   requests.push({op,args});if(op==='search'){if(heldSearch)return await heldSearch;return {results:cities};}
   if(failForecast)throw Error('Offline');if(heldForecast)return await heldForecast;return forecast();
  }};
  const mount=(recording=false)=>WeatherFixture.mountWorldEnvironment({root:document.querySelector('main'),dialog:null,close:null,onChange:()=>{},adapter,recording});
  let env=mount();const runtime=WeatherFixture.createWorldToolRuntime({execute:(_,args,meta)=>env.manageLocation(args,meta.signal)});
  let id=0;const call=(action,args={})=>runtime.gateway('call_world_tool',{target:'weather',action,arguments:JSON.stringify(args)},String(++id));
  check((await call('status')).status==='location-needed'&&requests.length===0&&located===0,'Fresh start performs no location request');
  check((await call('search')).error,'Search schema requires a city');
  const search=await call('search',{query:'Paris'});check(search.choices.length===2&&!JSON.stringify(search).includes('latitude')&&!JSON.stringify(search).includes('48.85'),'Disambiguation excludes coordinates');
  check((await call('status')).place===null,'Search does not select a city');
  check((await call('select',{choice:'invented'})).error,'Invented choice rejected');
  const selected=await call('select',{choice:search.choices[0].choice});
  check(selected.saved&&selected.status==='ready'&&selected.temperature===18&&saved.place.source==='city','Selected city saves and loads real forecast');
  check(document.getElementById('worldWeather').textContent.includes('18°'),'Forecast reaches HUD');
  check((await call('select',{choice:search.choices[1].choice})).error,'Consumed search cannot change location again');
  env.destroy();env=mount();check((await call('status')).place.includes('France'),'Saved city survives restart');
  const old=await call('search',{query:'Paris'});await call('search',{query:'Paris'});check((await call('select',{choice:old.choices[0].choice})).error,'New search invalidates previous choices');
  const offline=await call('search',{query:'Paris'});failForecast=true;
  const unavailable=await call('select',{choice:offline.choices[1].choice});check(unavailable.saved&&unavailable.status==='unavailable'&&unavailable.warning==='Offline','Offline forecast does not invent weather');failForecast=false;
  const blocked=await call('search',{query:'Paris'});failSave=true;
  check((await call('select',{choice:blocked.choices[0].choice})).saved===false,'Failed save is not successful receipt');failSave=false;
  heldSearch=new Promise(resolve=>releaseSearch=resolve);const pending=env.manageLocation({operation:'search',query:'Paris'});await new Promise(r=>setTimeout(r,0));await env.manageLocation({operation:'clear'});releaseSearch({results:cities});
  check((await pending).error&&(await call('status')).place===null,'Clear invalidates pending city search');heldSearch=null;
  const next=await call('search',{query:'Paris'});heldForecast=new Promise(resolve=>releaseForecast=resolve);
  const choosing=env.manageLocation({operation:'select',choice:next.choices[0].choice});await new Promise(r=>setTimeout(r,10));await env.manageLocation({operation:'clear'});releaseForecast(forecast());
  check((await choosing).error&&saved.place===null&&saved.weather===null,'Late forecast cannot undo cleared location');heldForecast=null;
  const controller=new AbortController();heldSearch=new Promise(resolve=>releaseSearch=resolve);const cancelled=env.manageLocation({operation:'search',query:'Paris'},controller.signal);await new Promise(r=>setTimeout(r,0));controller.abort();releaseSearch({results:cities});
  let stopped=false;try{await cancelled;}catch{stopped=true;}check(stopped,'Cancelled search returns no new choices');heldSearch=null;
  env.destroy();env=mount(true);check((await env.manageLocation({operation:'search',query:'Paris'})).error,'Practice cannot search or change personal location');env.destroy();
  check(located===0,'No device location permission request without opt-in');
  saved={};adapter.autoLocate=()=>true;adapter.locate=async()=>{located++;throw Error('Location denied. Search for a city.');};
  const settle=()=>new Promise(r=>setTimeout(r,30));
  env=mount();await settle();check(located===1&&saved.locationPrompted===true,'Selected weather asks once and remembers the attempt');env.destroy();
  env=mount();await settle();check(located===1,'Denied location does not prompt again after restart');env.destroy();
  saved={};env=mount(true);await settle();check(located===1,'Sample never requests device location');env.destroy();
  adapter.autoLocate=()=>false;
  adapter.locate=async()=>{located++;return {...cities[0],source:'device'};};
  const dialog=()=>{throw Error('Weather must not open a legacy dialog');};
  let opened=0;env=WeatherFixture.mountWorldEnvironment({root:document.querySelector('main'),dialog,close:()=>{},onChange:()=>{},onOpenWeather:()=>opened++,adapter});await settle();
  const trigger=document.getElementById('worldWeather');check(trigger.tagName==='BUTTON'&&trigger.textContent==='Check weather','Unset weather is an actionable button');trigger.click();await settle();
  check(located===2&&saved.place.source==='device'&&trigger.textContent.includes('18°'),'Manual location saves and updates HUD');
  trigger.click();await settle();check(opened===1&&located===2,'Subsequent click opens forecast instead of requesting location again');
  check(!document.querySelector('dialog,form'),'Direct weather action has no intermediate window or form');env.destroy();return true;
 });
 assert.equal(results,true);assert.deepEqual(errors,[]);
 console.log('PASS weather gateway: city choices, privacy, persisted forecast/HUD, restart, offline/save errors, stale choices, cancellation, clear races and practice isolation.');
});
