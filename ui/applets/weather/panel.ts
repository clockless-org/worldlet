import {node,appletSurface,actionButton,facts,notice,emptyState} from '../../components/index.ts';
import {weatherGlyph} from '../../world/index.ts';
import {weatherKind} from '../../world/index.ts';

const value=(v:any,suffix='')=>Number.isFinite(v)?Math.round(v)+suffix:'—';
export function createWeatherPanel({refresh,locate}:{refresh:()=>Promise<unknown>;locate:()=>Promise<unknown>}){
 const surface=appletSurface({title:'Weather'});surface.element.classList.add('weather-panel');
 let selected:number|null=null,state:any={},signature='',showDetail=false,forecastScroll=0;
 function openDay(time:number){forecastScroll=surface.body.scrollTop;selected=time;showDetail=true;draw();surface.body.scrollTop=0;surface.body.querySelector<HTMLButtonElement>('.weather-back')?.focus({preventScroll:true});}
 function backToForecast(){showDetail=false;draw();surface.body.scrollTop=forecastScroll;surface.body.querySelector<HTMLButtonElement>('[data-time="'+selected+'"]')?.focus({preventScroll:true});}
 const glyph=(code:number)=>{const icon=node('span','weather-panel-icon');icon.innerHTML=weatherGlyph(code);return icon;};
 function update(next:any){state=next||{};const key=JSON.stringify([state.forecast,state.temperature,state.wind,state.code,state.observedAt,state.placeName,state.timezone,state.busy,state.error,state.stale,state.hasLocation]);if(key===signature)return;signature=key;draw();}
 function draw(){
  const days=state.stale?[]:(state.forecast||[]).slice(0,7),tz=state.timezone;
  surface.meta.textContent=state.placeName||'Location not set';surface.body.replaceChildren();surface.footer.replaceChildren();surface.element.setAttribute('aria-busy',String(!!state.busy));
  const current=node('div','weather-current');
  current.append(glyph(state.temperature===null?null:state.code),node('strong','weather-temperature',value(state.temperature,'°C')),node('span','weather-condition',state.temperature===null?'Weather unavailable':weatherKind(state.code).label));
  const meta=node('div','weather-current-meta');meta.append(node('span','','Wind '+(state.temperature===null?'—':value(state.wind,' km/h'))),node('span','ui-caption',state.observedAt?'Updated '+new Intl.DateTimeFormat('en',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(state.observedAt):'No observation yet'));current.append(meta);surface.body.append(current);
  if(state.error||state.stale)surface.body.append(notice(state.error||(state.stale?'Weather is out of date. Refresh to see the latest forecast.':''),'error'));
  surface.body.append(node('h3','weather-forecast-heading','Seven-day forecast'));
  if(!days.length)surface.body.append(emptyState(state.busy?'Loading forecast…':'No forecast yet',state.hasLocation?'Refresh to try again.':'Allow location to see your local forecast.'));
  if(!days.some(day=>day.time===selected))selected=days[0]?.time||null;
  const list=node('div','weather-forecast-list');list.setAttribute('aria-label','Seven-day forecast');surface.body.append(list);
  const localDay=(time:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  const lows=days.map(d=>d.low).filter(Number.isFinite),highs=days.map(d=>d.high).filter(Number.isFinite),min=Math.min(...lows),max=Math.max(...highs),span=Math.max(1,max-min);
  for(const day of days){
   const label=localDay(day.time)===localDay(Date.now())?'Today':new Intl.DateTimeFormat('en',{timeZone:tz,weekday:'short'}).format(day.time);
   const condition=weatherKind(day.code).label,b=node('button','weather-forecast-row');b.type='button';b.dataset.time=String(day.time);b.setAttribute('aria-pressed',String(selected===day.time));b.setAttribute('aria-label',`${label}, ${condition}, low ${value(day.low,'°C')}, high ${value(day.high,'°C')}, precipitation ${value(day.rain,'%')}`);
   b.append(node('strong','weather-weekday',label),glyph(day.code),node('span','weather-row-condition',condition),node('span','weather-low',value(day.low,'°')));
   const track=node('span','weather-range'),bar=node('span');if(Number.isFinite(day.low)&&Number.isFinite(day.high)){bar.style.left=((day.low-min)/span*100)+'%';bar.style.width=(Math.max(.03,(day.high-day.low)/span)*100)+'%';track.append(bar);}b.append(track,node('strong','weather-high',value(day.high,'°')),node('span','weather-rain',value(day.rain,'%')));b.onclick=()=>openDay(day.time);list.append(b);
  }
  const day=days.find(d=>d.time===selected);
  if(day&&showDetail){surface.body.replaceChildren();const back=actionButton({label:'Back to forecast',run:backToForecast});back.classList.add('weather-back');surface.body.append(back);const detail=node('section','weather-selected-day');detail.setAttribute('aria-label','Selected day details');const date=new Intl.DateTimeFormat('en',{timeZone:tz,weekday:'long',month:'short',day:'numeric'}).format(day.time),clock=(time:number)=>Number.isFinite(time)&&time>0?new Intl.DateTimeFormat('en',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(time*1000):'—';detail.append(node('h3','',date),node('p','',weatherKind(day.code).label),facts([['Low / High',value(day.low,'°')+' / '+value(day.high,'°C')],['Precipitation chance',value(day.rain,'%')],['Maximum wind',value(day.wind,' km/h')],['Sunrise',clock(day.sunrise)],['Sunset',clock(day.sunset)]]));surface.body.append(detail);if(state.error)surface.body.append(notice(state.error,'error'));}
  surface.footer.append(node('span','ui-caption','Open-Meteo · °C'),actionButton({label:state.hasLocation?'Refresh':'Use my location',disabled:!!state.busy,run:async()=>{try{await(state.hasLocation?refresh():locate());}catch{surface.body.prepend(notice('Weather could not update. Try again.','error'));}}}));
 }
 return {element:surface.element,update};
}
