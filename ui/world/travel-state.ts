// A spatial summary is evidence, not decoration. Missing/edited evidence stays unknown.
export function travelState(section,pages,now=new Date()){
 const fact=key=>{const p=pages.get(section.trip?.[key]);return p&&!p.modifiedLocally?p.sceneFacts:null};
 const route=fact('route'),calendar=fact('calendar'),flight=fact('flight'),stay=fact('stay');
 const day=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return NaN;const value=Date.parse(s+'T00:00:00Z');return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===s?value:NaN};
 const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()),departure=day(calendar?.departure),end=day(calendar?.returnDate),days=Math.round((departure-today)/86400000);
 const countdown=!Number.isFinite(days)?'Departure not set':days>0?'Departs in '+days+' days':days===0?'Departing today':Number.isFinite(end)&&today<=end?'Trip in progress':'Departure date passed';
 return {experiment:section.stayExperiment||null,route:route?.summary||'Route not planned',countdown,dates:Number.isFinite(departure)&&Number.isFinite(end)&&end>=departure?calendar.departure.slice(5).replace('-','/')+' — '+calendar.returnDate.slice(5).replace('-','/')+' · '+(Math.round((end-departure)/86400000)+1)+' days': 'Set the trip dates first',flight:flight?.status||'Check flight status',flightDetail:flight?.summary||'Open source to verify',stay:stay?.status||'Check stay status',next:stay?.next||'Review trip details',needsStay:stay?.needsAction===true,stops:route?.stops||[],known:!!(route&&calendar&&flight&&stay)};
}
