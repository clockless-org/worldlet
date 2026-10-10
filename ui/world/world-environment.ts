import {environmentAt,normalizeWeather,forecastParams,validPlace,WEATHER_TTL} from './index.ts';
import {weatherGlyph} from './index.ts';
const el=(tag: string,text?: string): any=>Object.assign(document.createElement(tag),text===undefined?{}:{textContent:text});
const key='worldlet-environment-v1';
const browserAdapter={
 async load(){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}},
 async save(value){localStorage.setItem(key,JSON.stringify(value))},
 async request(operation,params){const base=operation==='search'?'https://geocoding-api.open-meteo.com/v1/search':'https://api.open-meteo.com/v1/forecast';const r=await fetch(base+'?'+new URLSearchParams(params),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Weather is unavailable. Please try again later.');return r.json()},
 async locate(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('Please search for a city.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:Math.round(p.coords.latitude*10000)/10000,longitude:Math.round(p.coords.longitude*10000)/10000,accuracy:p.coords.accuracy,locatedAt:Date.now(),source:'device',name:'Current location'}),()=>reject(Error('Location is unavailable. Search for a city or allow location access in System Settings.')),{enableHighAccuracy:false,timeout:15000,maximumAge:300000})})}
};
// Keep the painted world in daytime without changing the clock or forecast.
export function daytimeScene(current){return {...current,celestialDaylight:current.daylight,daylight:1,twilight:0,night:false};}
export function weatherStatus(current){
 const label=({rain:'Rainy',snow:'Snowy',fog:'Foggy',storm:'Stormy'})[current.kind]||(current.night&&current.label==='Partly sunny'?'Partly cloudy':current.label);
 return current.wind>=28&&current.kind!=='unknown'?(['clear','cloud'].includes(current.kind)?'Windy':label+' · Windy'):label;
}
export function mountWorldEnvironment({root,dialog,close,onChange,onOpenWeather,adapter=browserAdapter,recording=false}: {root: HTMLElement;dialog: any;close: any;onChange?: any;onOpenWeather?:()=>void;adapter?: any;recording?:boolean}) {
 const row=el('div');row.className='world-environment';
 const date=el('span'),time=el('time'),clock=el('div'),weatherControl=el('div'),weatherButton=el('button');weatherButton.type='button';weatherButton.id='worldWeather';weatherButton.title='Use my location to check weather';clock.className='world-date-time';weatherControl.className='world-weather-control';time.id='worldClock';date.id='worldDate';clock.append(date,time);weatherControl.append(weatherButton);row.append(clock,weatherControl);root.querySelector('.notion-top').append(row);
 // Keep the sample/dev presentation calm and readable by default. Fox can
 // still switch this visual override or return to the live forecast.
 let sceneWeather=recording?'clear':'actual',sceneLighting=recording?'day':'actual',previewDaylight=1,lightFrame=0;
 const mode=recording?'recording':'personal';let presentation={},presentationChanged=false,lastVisual;
 let place=null,weather=null,current=environmentAt(),generation=0,busy=false,lastAttempt=0,lastLocateAttempt=0,locating=false,followingDevice=false,saveChain=Promise.resolve(),message='',locationMessage='';
 let searching=0,destroyed=false,locationPrompted=false;const choices=new Map<string,any>();
 // The words the HUD shows travel with the weather, so a background check
 // reads the same sky the person sees without classifying codes again.
 const persist=()=>{presentation={...presentation,[mode]:{weather:sceneWeather,lighting:sceneLighting}};const value={locationPrompted,presentation,place,weather:weather?{...weather,words:weatherStatus(environmentAt(Date.now(),weather,place))}:weather};const saving=saveChain.then(()=>adapter.save(value)).then(()=>true).catch(()=>{message='Location could not be saved. Choose it again next time.';if(!destroyed)tick();return false});saveChain=saving.then(()=>{});return saving;};
 function tick(){const now=Date.now();current=environmentAt(now,weather,place);time.dateTime=new Date(now).toISOString();time.textContent=new Intl.DateTimeFormat('en-US',{timeZone:current.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);date.textContent=new Intl.DateTimeFormat('en-US',{timeZone:current.timezone,month:'long',day:'numeric',weekday:'short'}).format(now);weatherButton.textContent=locating?'Finding location…':locationMessage?'Location unavailable':!place?'Check weather':busy&&!weather?'Loading weather…':current.temperature===null?'Weather pending':`${weatherStatus(current)} ${Math.round(current.temperature)}°`;
 if(sceneWeather!=='actual')weatherButton.textContent=({clear:'Clear',cloud:'Cloudy',rain:'Rain',snow:'Snow'}[sceneWeather])+' scene';
 weatherButton.setAttribute('aria-label',weatherButton.textContent);root.dataset.timeOfDay=sceneLighting==='actual'?(current.night?'night':'day'):sceneLighting==='night'?'night':'day';root.dataset.sceneWeather=sceneWeather;root.dataset.sceneLighting=sceneLighting;
 if(sceneLighting==='night')weatherButton.textContent+=' · Night preview';
 const iconCode=sceneWeather==='actual'?(current.temperature!==null&&!locating&&!locationMessage?weather?.code:null):({clear:0,cloud:3,rain:61,snow:71})[sceneWeather];
 const weatherText=weatherButton.textContent.replace(/^[☾☀☁☂❄≋—]\s*/,''),iconNight=sceneWeather==='actual'?current.night:sceneLighting==='night';
 weatherButton.replaceChildren();
 if(iconCode!==null&&iconCode!==undefined){const icon=el('span');icon.className='world-weather-icon';icon.innerHTML=weatherGlyph(iconCode,iconNight);weatherButton.append(icon);}
 const parts=el('span');parts.className='world-weather-text';
 if(sceneWeather==='actual'&&place&&!locating&&!locationMessage&&current.temperature!==null){parts.append(el('span',weatherStatus(current)),document.createTextNode(' '),el('span',`${Math.round(current.temperature)}°`));if(sceneLighting==='night')parts.append(el('span','Night preview'));}
 else parts.textContent=weatherText;
 weatherButton.append(parts);weatherButton.setAttribute('aria-label',weatherText);
 weatherButton.disabled=locating||recording||!!adapter.presets;
 weatherButton.setAttribute('aria-busy',String(locating));
 const sky=current.positionMode==='location-calculated'?`Sun: altitude ${current.solar.altitude.toFixed(1)}°, bearing ${current.solar.azimuth.toFixed(1)}°\nMoon: altitude ${current.lunar.altitude.toFixed(1)}°, bearing ${current.lunar.azimuth.toFixed(1)}°`:'Allow location for local Sun and Moon positions';
 weatherButton.title=[locationMessage||message||(place?'Open seven-day forecast':'Use my location to check weather'),sky,`${current.lunar.phaseName} · ${Math.round(current.lunar.fraction*100)}% illuminated`].join('\n');
 const visual=sceneWeather==='actual'?current:{...current,kind:sceneWeather,cloud:sceneWeather==='clear'?0:.85,wind:sceneWeather==='clear'?4:12};
 lastVisual=sceneLighting==='actual'?visual:{...daytimeScene(visual),daylight:previewDaylight,night:previewDaylight<.15};onChange(lastVisual,weatherState());
 }
 async function refresh(force=false){if(adapter.presets)return;if(!place||busy||(!force&&Date.now()-lastAttempt<15*60*1000))return;busy=true;lastAttempt=Date.now();const turn=generation,target=place;tick();try{const raw=await adapter.request('forecast',forecastParams(target));if(turn!==generation)return;weather=normalizeWeather(raw);message='';persist()}catch(e){if(turn===generation)message=e.message}finally{if(turn===generation){busy=false;tick()}}}
 function cleanPlace(p){return {name:p.name,latitude:Math.round(p.latitude*10000)/10000,longitude:Math.round(p.longitude*10000)/10000,timezone:p.timezone,source:p.source||'city',locatedAt:p.locatedAt,accuracy:p.accuracy};}
 async function followLocation(){
  if(adapter.presets||!followingDevice||place?.source!=='device'||locating||Date.now()-lastLocateAttempt<15*60*1000)return;
  locating=true;lastLocateAttempt=Date.now();const turn=generation;
  try{const p=await adapter.locate();if(turn!==generation||!validPlace(p))return;const moved=Math.abs(p.latitude-place.latitude)+Math.abs(p.longitude-place.longitude)>.02;place=cleanPlace({...p,source:'device'});locationMessage='';if(moved){generation++;busy=false;weather=null;}persist();tick();if(moved)refresh(true);}
  catch{if(turn===generation){locationMessage='Location could not refresh. Sky and weather use your last known location.';tick();}}finally{locating=false;}
 }
 tick();const loaded=adapter.load().then(value=>{if(destroyed)return;locationPrompted=value?.locationPrompted===true;presentation={...(value?.presentation||{}),...presentation};if(!presentationChanged){const saved=presentation[mode];if(['actual','clear','cloud','rain','snow'].includes(saved?.weather))sceneWeather=saved.weather;if(['actual','day','night'].includes(saved?.lighting))sceneLighting=saved.lighting;previewDaylight=sceneLighting==='night'?0:1;tick();}if(generation||!validPlace(value?.place))return;place=cleanPlace({...value.place,source:value.place.source||(['Current location','当前位置'].includes(value.place.name)?'device':'city')});weather=value.weather&&['fetchedAt','observedAt','temperature','code','cloud','wind'].every(k=>Number.isFinite(value.weather[k]))&&Array.isArray(value.weather.sunrise)&&Array.isArray(value.weather.sunset)?value.weather:null;tick();if(!weather||!weather.forecast?.length||Date.now()-weather.fetchedAt>WEATHER_TTL)refresh(true);followLocation()}).catch(()=>{});
 async function locate(){
  await loaded;if(destroyed||locating||recording||adapter.presets)return;
  locationPrompted=true;locating=true;locationMessage='';const turn=++generation;busy=false;tick();
  await persist();
  try{const p=await adapter.locate();if(destroyed||turn!==generation)return;if(!validPlace(p))throw Error('Location unavailable. Search for a city instead.');place=cleanPlace({...p,source:'device'});weather=null;followingDevice=true;lastLocateAttempt=Date.now();await persist();await refresh(true);}
  catch(e){if(turn===generation)locationMessage=e.message||'Location unavailable. Search for a city instead.';}
  finally{locating=false;if(!destroyed)tick();}
 }
 async function ensureLocation(){await loaded;if(!destroyed&&!recording&&!adapter.presets&&!place&&!locationPrompted&&adapter.autoLocate?.())await locate();}
 void loaded.then(()=>ensureLocation());
 const optIn=()=>void ensureLocation();window.addEventListener('worldlet:weather-opt-in',optIn);
 weatherButton.onclick=async()=>{await loaded;if(destroyed)return;if(place){onOpenWeather?.();if(!weather||current.stale)void refresh(true);}else await locate();};
 function weatherState(){return {...current,code:weather?.code,observedAt:weather?.observedAt,busy:busy||locating,error:locationMessage||message,hasLocation:!!place};}
 function locationStatus(){const actual=environmentAt(Date.now(),weather,place);return {ok:true,place:place?.name||null,status:!place?'location-needed':actual.temperature===null?'unavailable':'ready',temperature:actual.temperature,weather:actual.label,...(message?{warning:message}:{}),scope:'Real forecast; visual scene overrides are unchanged.'};}
 async function manageLocation(args,signal?:AbortSignal){
  await loaded;signal?.throwIfAborted();if(destroyed)return {error:'This world is closed.'};
  if(recording||adapter.presets)return {error:'Weather location changes are available in the personal world.'};
  if(args.operation==='status')return locationStatus();
  if(args.operation==='search'){
   const query=String(args.query||'').trim();if(!query||query.length>100||/[\x00-\x1f]/.test(query))return {error:'Enter a city name.'};
   const search=++searching;choices.clear();const raw=await adapter.request('search',{name:query,count:6,language:'en',format:'json'});
   signal?.throwIfAborted();if(destroyed||search!==searching)return {error:'City search was superseded.'};
   const results=[];for(const p of Array.isArray(raw?.results)?raw.results.slice(0,6):[]){
    if(!validPlace(p))continue;const name=[p.name,p.admin1,p.country].filter(v=>typeof v==='string'&&v.length>0).join(', ');if(name.length>=160)continue;
    try{if(typeof p.timezone!=='string')continue;new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format();}catch{continue;}
    const choice=crypto.randomUUID();choices.set(choice,{place:cleanPlace({...p,name,source:'city'}),expires:Date.now()+10*60*1000});results.push({choice,name});
   }
   return {ok:true,choices:results,untrustedContent:true,instruction:'Choose the city requested by the user. Ask which one if ambiguous. No location has changed.'};
  }
  let selected=null;
  if(args.operation==='select'){const result=choices.get(args.choice);if(!result||result.expires<Date.now())return {error:'Search again and use a current city choice.'};selected=result.place;}
  else if(args.operation!=='clear')return {error:'Unknown weather location operation.'};
  generation++;searching++;choices.clear();locationPrompted=true;followingDevice=false;place=selected;weather=null;busy=false;message='';locationMessage='';tick();
  const turn=generation;if(!await persist())return {error:message,saved:false};
  signal?.throwIfAborted();if(destroyed||turn!==generation)return {error:'Weather location change was superseded.'};
  if(place)await refresh(true);
  signal?.throwIfAborted();
  if(destroyed||turn!==generation)return {error:'Weather location change was superseded.'};
  await saveChain;return {...locationStatus(),saved:true};
 }
 const interval=setInterval(()=>{if(document.hidden)return;tick();void ensureLocation();followLocation();if(!weather||Date.now()-weather.fetchedAt>WEATHER_TTL)refresh()},15000);
 const resume=()=>{if(!document.hidden){tick();followLocation();if(!weather||Date.now()-weather.fetchedAt>WEATHER_TTL)refresh()}};document.addEventListener('visibilitychange',resume);
 return {manageLocation,refresh:()=>refresh(true),requestLocation:locate,get weatherState(){return weatherState();},setSceneLighting(value){if(!['day','night','actual'].includes(value))return {error:'Choose day, night or actual.'};cancelAnimationFrame(lightFrame);const start=performance.now(),from=previewDaylight,to=value==='night'?0:value==='day'?1:current.daylight;sceneLighting=value;presentationChanged=true;persist();const step=(now)=>{const t=Math.min(1,(now-start)/2400),ease=t*t*(3-2*t);previewDaylight=from+(to-from)*ease;tick();if(t<1)lightFrame=requestAnimationFrame(step)};lightFrame=requestAnimationFrame(step);return {ok:true,lighting:value,scope:'Visual lighting preview only; local clock, forecast and location are unchanged.'};},setSceneWeather(value){if(!['actual','clear','cloud','rain','snow'].includes(value))return {error:'Unknown scene weather.'};sceneWeather=value;presentationChanged=true;persist();tick();return {ok:true,weather:value,scope:'Visual scene only; the real forecast is unchanged.'};},get current(){return lastVisual},destroy(){window.removeEventListener('worldlet:weather-opt-in',optIn);destroyed=true;searching++;choices.clear();cancelAnimationFrame(lightFrame);clearInterval(interval);document.removeEventListener('visibilitychange',resume);generation++;row.remove()}};
}
