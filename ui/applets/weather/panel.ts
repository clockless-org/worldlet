import {node,appletSurface,actionButton,facts,notice,emptyState,uiIcon} from '../../style/index.ts';
import {themeWeatherIcon} from '../../style/index.ts';
import {weatherGlyph,weatherKind} from '../../world/index.ts';

const value=(v:any,suffix='')=>Number.isFinite(v)?Math.round(v)+suffix:'—';
export function createWeatherPanel({refresh,locate,layout='list',demo=false}:{refresh:()=>Promise<unknown>;locate:()=>Promise<unknown>;layout?:'list'|'board';demo?:boolean}){
 const surface=appletSurface({title:'Weather'});surface.element.classList.add('weather-panel');surface.element.dataset.layout=layout;surface.heading.textContent=demo?'Weather · Demo':'Weather';
 const board=layout==='board';
 let selected:number|null=null,state:any={},signature='',showDetail=false,forecastScroll=0;
 function openDay(time:number){forecastScroll=surface.body.scrollTop;selected=time;showDetail=true;draw();surface.body.scrollTop=board?forecastScroll:0;surface.body.querySelector<HTMLButtonElement>(board?'[data-time="'+selected+'"]':'.weather-back')?.focus({preventScroll:true});}
 function backToForecast(){showDetail=false;draw();surface.body.scrollTop=forecastScroll;surface.body.querySelector<HTMLButtonElement>('[data-time="'+selected+'"]')?.focus({preventScroll:true});}
 const glyph=(code:number)=>{const icon=node('span','weather-panel-icon');icon.setAttribute('aria-hidden','true');const src=themeWeatherIcon(code);if(src){const img=node('img');img.src=src;img.alt='';img.draggable=false;img.onerror=()=>{icon.innerHTML=weatherGlyph(code);};icon.append(img);}else icon.innerHTML=weatherGlyph(code);return icon;};
 function update(next:any){state=next||{};const key=JSON.stringify([state.forecast,state.temperature,state.wind,state.code,state.observedAt,state.placeName,state.timezone,state.busy,state.error,state.stale,state.hasLocation]);if(key===signature)return;signature=key;draw();}
 async function updateWeather(forceLocation=false){try{await(!forceLocation&&state.hasLocation?refresh():locate());}catch{surface.body.prepend(notice('Weather could not update. Try again.','error'));}}
 function draw(){
  const days=state.stale?[]:(state.forecast||[]).slice(0,7),tz=state.timezone;
  surface.meta.textContent=state.placeName||'Location not set';surface.header.querySelector('.weather-refresh')?.remove();
  if(board){const location=actionButton({label:state.placeName||'Set location',icon:'compass',disabled:demo||!!state.busy,run:()=>updateWeather(true)});location.classList.add('weather-location');location.setAttribute('aria-label',demo?'Demo location':'Change weather location');surface.meta.replaceChildren(location);const reload=actionButton({label:state.busy?'Refreshing…':state.hasLocation?'Refresh':'Use my location',icon:state.hasLocation?'refresh':undefined,disabled:!!state.busy,run:updateWeather});reload.classList.add('weather-refresh');surface.header.append(reload);}surface.body.replaceChildren();surface.footer.replaceChildren();surface.element.setAttribute('aria-busy',String(!!state.busy));
  const current=node('div','weather-current');
  current.append(glyph(!Number.isFinite(state.temperature)?null:state.code),node('strong','weather-temperature',value(state.temperature,'°C')),node('span','weather-condition',!Number.isFinite(state.temperature)?'Weather unavailable':weatherKind(state.code).label));
  const meta=node('div','weather-current-meta');meta.append(node('span','','Wind '+(!Number.isFinite(state.temperature)?'—':value(state.wind,' km/h'))),node('span','ui-caption',demo?'Illustrative forecast':state.observedAt?'Updated '+new Intl.DateTimeFormat('en',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(state.observedAt):'No observation yet'));current.append(meta);surface.body.append(current);
  if(state.error||state.stale)surface.body.append(notice(state.error||(state.stale?'Weather is out of date. Refresh to see the latest forecast.':''),'error'));
  surface.body.append(node('h3','weather-forecast-heading',board&&days.length?new Intl.DateTimeFormat('en',{timeZone:tz,month:'long',year:'numeric'}).format(days[0].time):'Seven-day forecast'));
  if(!days.length)surface.body.append(emptyState(state.busy?'Loading forecast…':'No forecast yet',state.hasLocation?'Refresh to try again.':'Allow location to see your local forecast.'));
  if(!days.some(day=>day.time===selected))selected=days[0]?.time||null;
  const list=node('div','weather-forecast-list');list.setAttribute('aria-label','Seven-day forecast');surface.body.append(list);
  // One formatter per draw, not two per day: each Intl.DateTimeFormat is costly to build.
  const dayKey=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}),weekday=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',...(board?{day:'numeric'}:{})}),today=dayKey.format(Date.now());
  const lows=days.map(d=>d.low).filter(Number.isFinite),highs=days.map(d=>d.high).filter(Number.isFinite),min=Math.min(...lows),max=Math.max(...highs),span=Math.max(1,max-min);
  for(const day of days){
   const parts=weekday.formatToParts(day.time),label=board?parts.find(p=>p.type==='weekday')?.value+' '+parts.find(p=>p.type==='day')?.value:dayKey.format(day.time)===today?'Today':weekday.format(day.time);
   const condition=weatherKind(day.code).label,b=node('button','weather-forecast-row');b.type='button';b.dataset.time=String(day.time);b.setAttribute('aria-pressed',String(selected===day.time));b.setAttribute('aria-label',`${label}, ${condition}, low ${value(day.low,'°C')}, high ${value(day.high,'°C')}, precipitation ${value(day.rain,'%')}`);
   b.append(node('strong','weather-weekday',label),glyph(day.code),node('span','weather-row-condition',condition),node('span','weather-low',value(day.low,'°')));
   const track=node('span','weather-range'),bar=node('span');if(Number.isFinite(day.low)&&Number.isFinite(day.high)){bar.style.left=((day.low-min)/span*100)+'%';bar.style.width=(Math.max(.03,(day.high-day.low)/span)*100)+'%';track.append(bar);}b.append(track,node('strong','weather-high',value(day.high,'°')),node('span','weather-rain',value(day.rain,'%')));b.onclick=()=>openDay(day.time);list.append(b);
  }
  const day=days.find(d=>d.time===selected);
  if(day&&(showDetail||board)){if(!board){surface.body.replaceChildren();const back=actionButton({label:'Back to forecast',run:backToForecast});back.classList.add('weather-back');surface.body.append(back);}const detail=node('section','weather-selected-day');detail.setAttribute('aria-label','Selected day details');detail.setAttribute('aria-live','polite');const date=new Intl.DateTimeFormat('en',{timeZone:tz,weekday:'long',month:board?'long':'short',day:'numeric'}).format(day.time),clock=(time:number)=>Number.isFinite(time)&&time>0?new Intl.DateTimeFormat('en',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(time*1000):'—';detail.append(node('h3','',date));const summary=node('div','weather-day-summary');summary.append(glyph(day.code),node('p','weather-day-condition',weatherKind(day.code).label),node('p','weather-day-range','High '+value(day.high,'°C')+' · Low '+value(day.low,'°C')));detail.append(summary,facts([[board?'Precipitation':'Precipitation chance',value(day.rain,'%')],[board?'Wind':'Maximum wind',value(day.wind,' km/h')],...(Number.isFinite(day.humidity)?[['Humidity',value(day.humidity,'%')]]:[['Sunrise',clock(day.sunrise)],['Sunset',clock(day.sunset)]]) ]));if(board)for(const term of detail.querySelectorAll('dt')){const icon=term.textContent==='Wind'?'breeze':term.textContent==='Precipitation'||term.textContent==='Humidity'?'drop':null;if(icon){const mark=node('span','weather-fact-icon');mark.innerHTML=uiIcon(icon);term.prepend(mark);}}surface.body.append(detail);if(state.error&&!board)surface.body.append(notice(state.error,'error'));}
  surface.footer.append(node('span','ui-caption',demo?'Demo weather · Not a live forecast.':'Open-Meteo · °C'));if(!board)surface.footer.append(actionButton({label:state.hasLocation?'Refresh':'Use my location',disabled:!!state.busy,run:updateWeather}));
 }
 return {element:surface.element,update};
}
