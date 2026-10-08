import {weatherKind} from './world-environment.ts';
import {weatherArtwork} from '../../components/index.ts';
export function forecastDays(raw){
 const d=raw?.daily||{},value=(key,i)=>Number.isFinite(d[key]?.[i])?d[key][i]:null;
 return (Array.isArray(d.time)?d.time:[]).slice(0,7).map((time,i)=>({time:time*1000,code:value('weather_code',i),high:value('temperature_2m_max',i),low:value('temperature_2m_min',i),rain:value('precipitation_probability_max',i),wind:value('wind_speed_10m_max',i),sunrise:value('sunrise',i),sunset:value('sunset',i)})).filter(d=>Number.isFinite(d.time)&&d.time>0);
}
export function weatherGlyph(code,night=false){
 const kind=weatherKind(code).kind;
 return weatherArtwork(kind,code===1||code===2,night);
}
export function forecastStage(environment:any){
 const days=environment?.forecast||[],fmt=(v,suffix='')=>Number.isFinite(v)?Math.round(v)+suffix:'—';
 const timezone=environment?.timezone;
 return {connected:true,error:environment?.stale?'Weather is out of date. Ask Fox to refresh it.':!days.length?'Ask Fox to set your location or refresh the seven-day forecast.':null,
 scope:(environment?.placeName?environment.placeName+' · ':'')+'Seven-day forecast · °C · Open-Meteo',
 items:days.map(d=>{const title=new Intl.DateTimeFormat('en',{timeZone:timezone,weekday:'short',month:'short',day:'numeric'}).format(d.time),kind=weatherKind(d.code),context=fmt(d.high,'°')+' / '+fmt(d.low,'°'),detail=[kind.label,'High '+fmt(d.high,'°C')+' · Low '+fmt(d.low,'°C'),'Chance of precipitation: '+fmt(d.rain,'%'),'Maximum wind: '+fmt(d.wind,' km/h')].join('\n\n');return {id:'weather:'+d.time,title,context,when:kind.label,weatherCode:d.code,state:'forecast',record:{id:'weather:'+d.time,title,text:detail}};})};
}
