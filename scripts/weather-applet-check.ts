import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
import {normalizeWeather,environmentAt,forecastParams} from '../ui/world/environment/world-environment.ts';
import {forecastStage,weatherGlyph} from '../ui/world/environment/weather-forecast.ts';
assert.equal(new Set([0,1,3,61,71,95,45,null].map(code=>weatherGlyph(code))).size,8,'Weather family has distinct condition artwork');
assert.notEqual(weatherGlyph(0),weatherGlyph(0,true),'Clear night uses the Moon');
const now=Date.now(),times=Array.from({length:7},(_,i)=>Math.floor(now/1000)+i*86400);
const raw={timezone:'America/Los_Angeles',current:{time:Math.floor(now/1000),temperature_2m:18,weather_code:0,is_day:1,wind_speed_10m:12},daily:{time:times,weather_code:[0,2,61,71,95,45,3],temperature_2m_max:[23,24,19,5,17,20,21],temperature_2m_min:[14,15,12,-1,11,12,13],precipitation_probability_max:[0,10,80,70,90,20,30],wind_speed_10m_max:[12,15,22,18,30,9,14],sunrise:times.map(t=>t-3600),sunset:times.map(t=>t+36000)}};
const weather=normalizeWeather(raw,now),place={name:'Test city',latitude:37,longitude:-122};
assert.equal(forecastParams(place).forecast_days,7);assert.equal(forecastStage(environmentAt(now,weather,place)).items.length,7);assert.equal(forecastStage(environmentAt(now+3*3600000,weather,place)).items.length,0);
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=pageErrors(page,{console:true});
 await page.addInitScript(({weather,place,raw})=>{
  window.calls=[];(window as any).offline=false;
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {workspaceId:'weather-test',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:['app-gmail'],hiddenApplets:['app-weather']},cloudConsent:false,sampleEnabled:false};if(b.action==='weatherLoad')return location.search.includes('fresh')?null:{weather,place};if(b.action==='weatherLocate')return place;if(b.action==='weatherRequest'){if((window as any).offline)throw Error('Offline');return raw;}if(b.action==='modelStatus')return {available:true};return {ok:true};}}}};
 },{weather,place,raw});
 const url=worldUrl();
 async function readerClear(){
  const reader=await page.locator('.weather-panel').boundingBox();
  const viewport=page.viewportSize();if(viewport.width>800)assert(Math.abs(reader.x-64)<2&&Math.abs(reader.y-64)<2&&Math.abs(viewport.height-reader.y-reader.height-64)<2,'Weather equal top/left/bottom Focus gutters: '+JSON.stringify({reader,viewport}));
  for(const selector of ['.companion-dialogue','.companion-avatar','.world-actions .world-capsule','.applet-bar-side button','.companion-text-entry']){
   for(const control of await page.locator(selector).all()){
    if(!await control.isVisible())continue;
    const box=await control.boundingBox();
    assert(box.x+box.width<=reader.x||box.x>=reader.x+reader.width||box.y+box.height<=reader.y||box.y>=reader.y+reader.height,`${selector} must not cover the reader`);
   }
  }
  assert(await page.locator('.weather-panel .ui-applet-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Weather data fits without horizontal clipping');
  const refresh=page.getByRole('button',{name:'Refresh',exact:true});
  await refresh.click();
  await page.locator('.weather-panel[aria-busy=false]').waitFor();
 }
 await page.goto(url+'?fresh');await waitForWorld(page);
 await page.getByRole('button',{name:'Check weather',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#worldWeather')?.textContent.includes('18°'));
 assert.equal(await page.locator('#notionDialog').isVisible(),false);
 assert.equal(await page.locator('#worldWeather').textContent(),'Clear 18°','HUD reads condition then temperature without a separator');
 // The HUD rebuilds its children every clock tick: measure them in one pass, not one locator at a time.
 const [iconBox,textBox,condition,temperature]=await page.evaluate(()=>['#worldWeather .world-weather-icon','#worldWeather>span:last-child','.world-weather-text>span:first-child','.world-weather-text>span:nth-child(2)']
  .map(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
 assert.equal(iconBox.width,28);assert.equal(iconBox.height,28);assert(Math.abs(textBox.x-iconBox.x-iconBox.width-10)<1,'Weather icon has a 10px text gap');
 assert(Math.abs(temperature.x-condition.x-condition.width-10)<1,'Condition and temperature share the 10px spacing');
 assert.equal(await page.locator('.world-date-time').evaluate(e=>getComputedStyle(e).gap),'10px');
 assert.equal(await page.locator('.world-audio-now').evaluate(e=>getComputedStyle(e).marginLeft),'10px');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='weatherLocate').length),1);
 await page.locator('#worldWeather').click();await page.locator('.weather-panel').waitFor();
 assert.equal(await page.locator('.weather-forecast-row').count(),7);assert.match(await page.locator('.weather-current').innerText(),/18°C/);
 assert.equal(await page.getByRole('navigation',{name:'Forecast pages'}).count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='weatherLocate').length),1,'opening forecast does not request location again');
 assert.equal(await page.evaluate(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active),'app-weather','forecast opens without ground installation');
 await page.locator('.weather-forecast-row').nth(2).click();assert.match(await page.locator('.weather-selected-day').innerText(),/80%/);
 assert.equal(await page.locator('.weather-forecast-list').count(),0);await page.getByRole('button',{name:'Back to forecast',exact:true}).click();
 await page.evaluate(()=>window.worldletExecute('set_scene_lighting',{lighting:'day'}));await page.waitForTimeout(2600);await page.screenshot({path:'/tmp/weather-village-day.png'});
 await page.evaluate(()=>window.worldletExecute('set_scene_weather',{weather:'snow'}));assert.match(await page.locator('.weather-current').innerText(),/Clear/,'visual weather does not replace real forecast');
 await page.evaluate(()=>window.worldletExecute('set_scene_lighting',{lighting:'night'}));await page.waitForTimeout(2600);await page.screenshot({path:'/tmp/weather-village-night.png'});
 await readerClear();
 await page.setViewportSize({width:900,height:650});
 const footerBefore=await page.locator('.weather-panel .ui-applet-footer').boundingBox();
 await page.locator('.weather-forecast-row').last().scrollIntoViewIfNeeded();
 const footerAfter=await page.locator('.weather-panel .ui-applet-footer').boundingBox();assert(Math.abs(footerBefore.y-footerAfter.y)<1,'Refresh stays fixed while forecast scrolls');
 assert(await page.locator('.weather-panel .ui-applet-body').evaluate(e=>e.scrollTop>0));
 assert(await page.locator('#notionContent').evaluate(e=>e.scrollTop===0&&e.scrollHeight<=e.clientHeight+1),'No outer weather scroll');
 const readingPosition=await page.locator('.weather-panel .ui-applet-body').evaluate(e=>e.scrollTop);
 await page.locator('.weather-forecast-row').last().click();await page.getByRole('button',{name:'Back to forecast',exact:true}).click();
 assert(Math.abs(await page.locator('.weather-panel .ui-applet-body').evaluate(e=>e.scrollTop)-readingPosition)<2,'Returning from details preserves reading position');
 await page.screenshot({path:'/tmp/weather-scroll-compact.png'});
 await readerClear();
 await page.setViewportSize({width:390,height:844});const bounds=await page.locator('.weather-panel').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert.equal(await page.locator('.weather-forecast-row').count(),7);await page.screenshot({path:'/tmp/weather-village-narrow.png'});
 await readerClear();
 await page.locator('.weather-forecast-row').last().click();await page.getByRole('button',{name:'Back to forecast',exact:true}).click();
 await page.evaluate(()=>(window as any).offline=true);await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').filter({hasText:'Offline'}).waitFor();
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-depth')!=='object');
 assert.equal(await page.locator('.browser-viewport').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS first-click location, next-click Weather without ground installation, seven days, selection, real/scene separation, night/narrow and refresh failure. Fixture only.');
});
