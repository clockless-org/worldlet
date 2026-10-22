/** Evidence times are ISO dates or offset-bearing instants, never ambient-zone strings. */
export function validAttentionTime(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return false;
 const date=value.slice(0,10),day=new Date(date+'T00:00:00Z');
 return Number.isFinite(Date.parse(value))&&Number.isFinite(+day)&&day.toISOString().slice(0,10)===date;
}

/** Next local calendar day, same wall clock (no preference exists today).
 * The caller supplies the user's zone; never infer it from a server/workspace.
 * DST gaps advance by the gap; repeated clocks select the earlier instant. */
export function attentionLaterUntil(now:number,timeZone:string):string {
 if(!Number.isFinite(now)||!timeZone)throw Error('A local time zone is needed for Later.');
 const format=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const wall=(at:number)=>{const p=Object.fromEntries(format.formatToParts(at).map(p=>[p.type,p.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
 const target=wall(now)+86400000,offsets=new Set<number>();
 // Sampling both sides includes DST and date-line transitions without assuming 24h days.
 for(let h=-48;h<=48;h+=6){const at=target+h*3600000;offsets.add(wall(at)-at);}
 const candidates=[...offsets].map(offset=>target-offset).sort((a,b)=>a-b);
 const exact=candidates.find(at=>wall(at)===target);
 const later=candidates.filter(at=>wall(at)>target).sort((a,b)=>wall(a)-wall(b))[0];
 const result=exact??later;
 if(result===undefined||result<=now)throw Error('Could not resolve the next local day.');
 return new Date(result+((now%1000)+1000)%1000).toISOString();
}
