// Calendar and Drive listing reads of the World's Google connection, and the page they answer with (ported from the
// Calendar, Drive and result parts of Hermes host.py `_google_reads`).
import type {GoogleRest} from './rest.ts';
import {got,pyInt,pyType} from './python.ts';

const SCOPES:Record<string,string>={'google-calendar':'Next 30 days, this page only; follow nextPageToken','google-drive':'Latest 20 file metadata records; no file contents'};
type Read={records:{id:string;data:any}[];nextPageToken?:string;[key:string]:unknown};

/** The page a Google read answers with. Gmail keeps its reader's own page (records, nextPageToken, scope, …). */
export function googleReadResult(service:string,label:string,page:Read){
 if(service==='gmail')return {ok:true,label,bounded:true,...page};
 if(!Object.hasOwn(SCOPES,service))throw new Error('Unsupported Google service.');
 const {records}=page;
 return {ok:true,label,records,scannedCount:records.length,nextPageToken:service==='google-calendar'?page.nextPageToken:'',bounded:true,metadataOnly:service==='google-drive',scope:SCOPES[service]};
}

/** `datetime.isoformat()` of a UTC instant in whole seconds and microseconds. */
function iso(seconds:number,micro:number){
 const whole=seconds+Math.floor(micro/1e6),us=micro-Math.floor(micro/1e6)*1e6;
 return new Date(whole*1000).toISOString().slice(0,19)+(us?'.'+String(us).padStart(6,'0'):'')+'+00:00';
}
const halfEven=(x:number)=>{const r=Math.round(x);return Math.abs(x%1)===0.5&&r%2?r-1:r;};

/** The primary calendar: one event by `id`, or the window from `windowStart` (seconds, default now) over `windowDays`.
 * `test` reads only the calendar's name. `now` is milliseconds since 1970. */
export async function readCalendar(api:GoogleRest,body:any,operation:string,now=Date.now()){
 const identifier=got(body,'id','');
 if(typeof identifier!=='string'||identifier.length>256||!/^[A-Za-z0-9_-]*$/.test(identifier))throw new Error('Invalid Google Calendar event ID.');
 if(identifier){
  const event=await api.get('calendar/v3/calendars/primary/events/'+identifier);
  if(got(event,'id')!==identifier)throw new Error('Calendar did not return the requested event.');
  return {ok:true,records:[{id:identifier,data:event}],bounded:true,scope:'One requested primary-calendar event · Read only'};
 }
 // Event access is sufficient, including the calendar display name; calendars.get() needs broader permissions.
 let seconds=Math.floor(now/1000),micro=(now-seconds*1000)*1000;
 const windowStart=got(body,'windowStart');
 if(windowStart!==undefined&&windowStart!==null){
  if(typeof windowStart!=='number'&&typeof windowStart!=='boolean')throw new Error('Invalid calendar window.');
  const value=+windowStart,whole=Math.trunc(value);
  let fraction=halfEven((value-whole)*1e6);
  seconds=whole;
  if(fraction>=1e6){fraction-=1e6;seconds++;}else if(fraction<0){fraction+=1e6;seconds--;}
  micro=fraction;
 }
 const pageToken=got(body,'pageToken','');
 if(typeof pageToken!=='string'||pageToken.length>2048)throw new Error('Invalid Calendar page token.');
 const days=got(body,'windowDays',30);
 if(typeof days!=='number'&&typeof days!=='boolean')throw new TypeError(`unsupported type for timedelta days component: ${pyType(days)}`);
 const span=halfEven(+days*86400e6);
 const listing=await api.get('calendar/v3/calendars/primary/events',{timeMin:iso(seconds,micro),
  timeMax:iso(seconds+Math.trunc(span/1e6),micro+span%1e6),
  maxResults:operation==='test'?1:Math.min(20,Math.max(1,pyInt(got(body,'limit',20)))),
  ...(pageToken?{pageToken}:{}),singleEvents:true,orderBy:'startTime',showDeleted:true,...(operation==='test'?{fields:'summary'}:{})});
 const records=operation==='test'?[]:(got(listing,'items',[]) as any[]).map(x=>({id:x.id,data:x}));
 return googleReadResult('google-calendar',got(listing,'summary','Google Calendar'),{records,nextPageToken:got(listing,'nextPageToken','')});
}

/** The account's latest Drive files, metadata only; `test` reads only the account. */
export async function readDriveList(api:GoogleRest,operation:string){
 const profile=await api.get('drive/v3/about',{fields:'user(displayName,emailAddress)'});
 const label=got(got(profile,'user',{}),'emailAddress','Google Drive');
 let records=[];
 if(operation!=='test'){
  const listing=await api.get('drive/v3/files',{q:'trashed = false',pageSize:20,orderBy:'modifiedTime desc',fields:'files(id,name,mimeType,modifiedTime,webViewLink,description)'});
  records=(got(listing,'files',[]) as any[]).map(x=>({id:x.id,data:x}));
 }
 return googleReadResult('google-drive',label,{records});
}
