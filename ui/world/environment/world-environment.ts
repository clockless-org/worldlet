import {forecastDays} from './weather-forecast.ts';
import {celestialAt,lunarPhaseAt} from './celestial.ts';
// Weather is presentation state, separate from personal context and world revisions.
export const WEATHER_TTL = 30 * 60 * 1000;
export const WEATHER_MAX_AGE = 2 * 60 * 60 * 1000;
export const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
export function validPlace(p) {
  return !!p && typeof p.name==='string' && p.name.length>0 && p.name.length<160 && Number.isFinite(p.latitude) && Math.abs(p.latitude)<=90 && Number.isFinite(p.longitude) && Math.abs(p.longitude)<=180;
}
export function weatherKind(code) {
  if([71,73,75,77,85,86].includes(code))return {kind:'snow',label:'Snow',symbol:'❄'};
  if([95,96,99].includes(code))return {kind:'storm',label:'Thunderstorms',symbol:'☂'};
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return {kind:'rain',label:'Rain',symbol:'☂'};
  if([45,48].includes(code))return {kind:'fog',label:'Fog',symbol:'≋'};
  if([2,3].includes(code))return {kind:'cloud',label:code===3?'Overcast':'Cloudy',symbol:'☁'};
  if([0,1].includes(code))return {kind:'clear',label:code===0?'Clear':'Partly sunny',symbol:'☀'};
  return {kind:'unknown',label:'Weather unavailable',symbol:'—'};
}
export function normalizeWeather(raw, now=Date.now()) {
  const c=raw?.current;
  if(!c || !Number.isFinite(c.temperature_2m) || !Number.isFinite(c.time) || Math.abs(now-c.time*1000)>WEATHER_MAX_AGE || weatherKind(c.weather_code).kind==='unknown')throw Error('Weather data is unavailable. Try again later.');
  let timezone=raw.timezone;
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{timezone=undefined}
  return {forecast:forecastDays(raw),temperature:c.temperature_2m,code:c.weather_code,cloud:clamp((c.cloud_cover??50)/100),wind:clamp(c.wind_speed_10m??0,0,150),windFrom:Number.isFinite(c.wind_direction_10m)?((c.wind_direction_10m%360)+360)%360:null,isDay:c.is_day===1,observedAt:c.time*1000,fetchedAt:now,timezone,sunrise:raw.daily?.sunrise||[],sunset:raw.daily?.sunset||[]};
}
export function environmentAt(now=Date.now(), weather=null, place=null) {
  const fresh=weather && Number.isFinite(weather.observedAt) && Math.abs(now-weather.observedAt)<WEATHER_MAX_AGE;
  let timezone=weather?.timezone||place?.timezone;
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{timezone=undefined}
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const hour=Number(parts.find(p=>p.type==='hour').value)+Number(parts.find(p=>p.type==='minute').value)/60;
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
  let daylight=smooth((hour-5.5)/1.5)*(1-smooth((hour-17.5)/1.5)),progress=clamp((hour-6)/12);
  // Epoch values keep sunrise/sunset correct across timezone and DST boundaries.
  const localDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
  const index=weather?.sunrise?.findIndex(s=>Number.isFinite(s)&&s>0&&localDay(s*1000)===localDay(now))??-1;
  if(index>=0 && weather.sunset?.[index]>weather.sunrise[index]){
    const rise=weather.sunrise[index]*1000,set=weather.sunset[index]*1000,twilight=45*60*1000;
    daylight=smooth((now-rise+twilight)/(twilight*2))*(1-smooth((now-set+twilight)/(twilight*2)));
    progress=clamp((now-rise)/(set-rise));
  }else if(fresh && (Math.abs(weather.sunrise?.[0]||0)<1))daylight=weather.isDay?1:0; // polar day/night
  const located=validPlace(place);
  // Unknown location gets no Sun or Moon position; nothing is invented.
  const {solar,lunar}=located?celestialAt(now,place):{solar:{altitude:-90,azimuth:0},lunar:{altitude:-90,azimuth:0,...lunarPhaseAt(now)}};
  if(located){daylight=smooth((solar.altitude+6)/12);progress=clamp((solar.azimuth-90)/180);}
  const info=fresh?weatherKind(weather.code):weatherKind(null);
  return {forecast:fresh?(weather.forecast||[]):[],placeName:place?.name||'',daylight,progress,twilight:4*daylight*(1-daylight),night:daylight<.2,timezone,hour,...info,cloud:fresh?Math.max(clamp(Number.isFinite(weather.cloud)?weather.cloud:.5),weather.code===3||info.kind==='storm'?.96:info.kind==='fog'?.9:['rain','snow'].includes(info.kind)?.72:0):0,wind:fresh?weather.wind:0,windFrom:fresh&&Number.isFinite(weather.windFrom)?weather.windFrom:null,stale:!!weather&&!fresh,temperature:fresh?weather.temperature:null,solar,lunar,positionMode:located?'location-calculated':'location-needed'};
}
export function forecastParams(place) {
  if(!validPlace(place))throw Error('Please choose a valid city.');
  return {latitude:Math.round(place.latitude*100)/100,longitude:Math.round(place.longitude*100)/100,current:'temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day',daily:'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',timezone:'auto',timeformat:'unixtime',forecast_days:7};
}
