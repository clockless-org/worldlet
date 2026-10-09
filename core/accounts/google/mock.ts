import type {GoogleQuery,GoogleRest} from './rest.ts';

/** Development builds only: a fictional Google account for rehearsing onboarding without OAuth. It replaces only the
 * REST transport: Gmail paging, discovery, Calendar reads, normalization and Fox run unchanged against it. */
export const MOCK_GOOGLE_EMAIL='you@worldlet.test';
const DEMO_SITE='https://demo.worldlet.test';
type Thread=[key:string,days:number,sender:string,subject:string,body:string,labels:string[]];
// Days are relative to now (negative = past, positive = future).
const THREADS:Thread[]=[
 ['d3a1',-0.05,'Bright Smile Dental <frontdesk@brightsmile.example>','Action needed: book your cleaning by Friday',
  "Hi there,\n\nIt has been six months since your last cleaning with Dr. Chen, so you're due for your next visit. "+
  "Please book your appointment by Friday; we are holding this week's openings for patients who are due.\n\n"+
  `Book online here: ${DEMO_SITE}/brightsmile\n\nOpenings this week include Thursday at 10:00 AM and Friday at 2:30 PM. `+
  'Booking takes under a minute; no payment is needed until your visit.\n\nBright Smile Dental',['INBOX','UNREAD']],
 ['a7f2',-0.4,'Priya Nair <priya@northwind.example>','Q4 roadmap draft by Thursday?',
  "Hey,\n\nCould you send me your draft of the Q4 roadmap by Thursday end of day? I'd like to review it before our 1:1 on Thursday afternoon. "+
  'A rough outline with the three main bets is fine.\n\nThanks!\nPriya',['INBOX','UNREAD']],
 ['b5c9',-2.5,'Skyway Airlines <trips@skyway.example>','Your trip to New York: check-in opens tomorrow',
  'Your flight SK 482 from San Francisco (SFO) to New York (JFK) departs in 2 days at 8:15 AM. '+
  'Online check-in opens 24 hours before departure. Confirmation code: QX7T2P. Seat 14C.',['INBOX']],
 ['c2e4',-3.0,'Oakview Apartments <leasing@oakview.example>','Lease renewal — please sign by October 15',
  'Your current lease ends on October 31. To renew for 12 months at the same rate, please review and sign the renewal in the resident portal by October 15. '+
  'If you plan to move out, let us know in writing by the same date.',['INBOX']],
 ['e8b1',-0.8,'Sam Okafor <sam.okafor@example.com>','Dinner Saturday?',
  'Hey! A few of us are getting dinner Saturday at 7 PM at Maple Table. Want to join? Let me know by Friday so I can update the reservation.',['INBOX','UNREAD']],
 ['f4d6',-0.15,'City Water Utility <billing@citywater.example>','Your water bill is ready: $46.18 due in 5 days',
  'Your statement for September is ready. Amount due: $46.18, due in 5 days. You can pay online or set up autopay in your account.\n\n'+
  `View and pay your bill: ${DEMO_SITE}/citywater`,['INBOX']],
 ['a1c3',-0.1,'StreamBox <hello@streambox.example>','Confirm your cancellation before Friday',
  'We received your request to cancel StreamBox Premium when your free trial ends. To finish, confirm the cancellation '+
  'on your membership page before Friday; otherwise your card will be charged $15.99 per month.\n\n'+
  `Confirm your cancellation: ${DEMO_SITE}/streambox`,['INBOX']],
 ['b9e2',-0.2,'ParcelGo <updates@parcelgo.example>','Delivered: your package was left at the front door',
  'Your package (order 88-2231, noise-cancelling headphones) was delivered today at 2:14 PM and left at the front door.',['INBOX','UNREAD']],
 ['c6a8',-1.5,'First Harbor Bank <alerts@firstharbor.example>','Refund processed: $84.20',
  'A refund of $84.20 from Riverside Outfitters has been credited to your card ending 6411. It should appear on your statement within 1–2 business days.',['INBOX']],
 ['d2f5',-2.8,'Lincoln Elementary <office@lincoln-elem.example>','Picture day is this Friday',
  'Reminder: school picture day is this Friday. Order forms are optional and can be returned on the day. Retakes are scheduled for November 12.',['INBOX']],
 ['e3b7',-0.6,'Riverside Outfitters <deals@riverside.example>','Weekend sale: 30% off jackets',
  'Our biggest weekend sale is here. Save 30% on jackets and fleece through Sunday. Shop now while sizes last.',['CATEGORY_PROMOTIONS']],
 ['f9c1',-1.1,'The Morning Brief <news@morningbrief.example>','Today: markets, tech and weather',
  'Your daily digest: markets opened higher, three new product launches in consumer tech, and a sunny weekend ahead.',['CATEGORY_PROMOTIONS']],
];
// Fictional primary calendar: start in days from now, local wall time, duration in hours.
const EVENTS:[key:string,days:number,clock:string,hours:number,title:string,description:string,location:string][]=[
 ['standup01',1,'09:30',0.5,'Team standup','Daily sync with the product team.','Zoom'],
 ['oneonone01',3,'14:00',0.5,'1:1 with Priya','Weekly 1:1. Agenda: Q4 roadmap draft.','Priya’s office'],
 ['flight01',2,'08:15',5.5,'Flight SK 482 SFO → JFK','Confirmation QX7T2P · Seat 14C','San Francisco International Airport'],
 ['yoga01',5,'09:00',1,'Yoga class','Saturday vinyasa flow.','Harbor Yoga Studio'],
];
const DAY=86_400_000;
const base64url=(text:string)=>{const bytes=new TextEncoder().encode(text);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_');};
const threadId=(key:string)=>key.repeat(4).slice(0,16);
const rfc2822=(date:Date)=>{
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],pad=(n:number)=>String(n).padStart(2,'0');
 return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
};
function message([key,days,sender,subject,body,labels]:Thread,now:number){
 const id=threadId(key),when=now+days*DAY;
 return {id,threadId:id,labelIds:labels,internalDate:String(Math.floor(when)),historyId:'1',snippet:body.slice(0,160),sizeEstimate:body.length,
  payload:{mimeType:'text/plain',headers:[{name:'Subject',value:subject},{name:'From',value:sender},{name:'To',value:MOCK_GOOGLE_EMAIL},{name:'Date',value:rfc2822(new Date(when))}],
   body:{data:base64url(body)}}};
}
function matches(row:Thread,internalDate:number,query:string){
 const text=(row[3]+' '+row[4]).toLowerCase(),after=/after:(\d+)/.exec(query);
 if(after&&Math.floor(internalDate/1000)<=Number(after[1]))return false;
 if(query.includes('is:unread')&&!row[5].includes('UNREAD'))return false;
 const terms=[...query.matchAll(/"([^"]+)"/g)].map(match=>match[1].toLowerCase());
 return !terms.length||terms.some(term=>text.includes(term));
}
const page=<T>(rows:T[],max:unknown,token:unknown):[T[],string]=>{const start=Number(token||0),end=start+Number(max||20);return [rows.slice(start,end),end<rows.length?String(end):''];};
/** ISO time with the computer's own offset, as Python's `datetime.astimezone().isoformat()` writes it. */
function localISO(time:number){
 const date=new Date(time),offset=-date.getTimezoneOffset(),pad=(n:number)=>String(Math.floor(Math.abs(n))).padStart(2,'0');
 const local=new Date(time+offset*60_000).toISOString().slice(0,19);
 return `${local}${offset>=0?'+':'-'}${pad(offset/60)}:${pad(offset%60)}`;
}
function event([key,days,clock,hours,title,description,location]:typeof EVENTS[number],now:number){
 const start=new Date(now+days*DAY),[hour,minute]=clock.split(':').map(Number);start.setHours(hour,minute,0,0);
 const begins=start.getTime(),ends=begins+hours*3_600_000;
 return {id:key,status:'confirmed',summary:title,description,location,htmlLink:'https://calendar.google.com/calendar/event?eid='+key,
  start:{dateTime:localISO(begins)},end:{dateTime:localISO(ends)},organizer:{email:MOCK_GOOGLE_EMAIL,self:true},updated:localISO(now)};
}

export function mockGoogle(now:()=>number=Date.now):GoogleRest {
 const get=async(route:string,query:GoogleQuery={})=>{
  const time=now(),messages=THREADS.map(row=>({row,message:message(row,time)}));
  if(route==='gmail/v1/users/me/profile')return {emailAddress:MOCK_GOOGLE_EMAIL,messagesTotal:THREADS.length};
  const list=/^gmail\/v1\/users\/me\/(messages|threads)$/.exec(route);
  if(list){
   const rows=messages.filter(({row,message})=>matches(row,Number(message.internalDate),String(query.q??''))).sort((a,b)=>Number(b.message.internalDate)-Number(a.message.internalDate));
   const [chosen,token]=page(rows,query.maxResults,query.pageToken);
   return {[list[1]]:chosen.map(({message})=>({id:message.id,threadId:message.threadId})),nextPageToken:token,resultSizeEstimate:rows.length};
  }
  const one=/^gmail\/v1\/users\/me\/(messages|threads)\/([^/]+)$/.exec(route);
  if(one){
   const found=messages.find(({message})=>message.id===one[2])?.message;
   if(!found)throw new Error('Mock Gmail has no message '+one[2]);
   return one[1]==='threads'?{id:one[2],historyId:'1',messages:[found]}:found;
  }
  if(route==='calendar/v3/calendars/primary/events'){
   const low=query.timeMin?Date.parse(String(query.timeMin)):null,high=query.timeMax?Date.parse(String(query.timeMax)):null;
   const rows=EVENTS.map(row=>event(row,time)).filter(e=>(low===null||Date.parse(e.end.dateTime)>=low)&&(high===null||Date.parse(e.start.dateTime)<=high)).sort((a,b)=>a.start.dateTime<b.start.dateTime?-1:1);
   const [items,token]=page(rows,query.maxResults,query.pageToken);
   return {summary:'Calendar',items,nextPageToken:token};
  }
  const single=/^calendar\/v3\/calendars\/primary\/events\/([^/]+)$/.exec(route);
  if(single){const row=EVENTS.find(row=>row[0]===single[1]);if(!row)throw new Error('Mock Calendar has no event '+single[1]);return event(row,time);}
  throw new Error('Mock Google supports Mail and Calendar only.');
 };
 return {
  get,
  getAll:requests=>Promise.all(requests.map(request=>get(request.path,request.query))),
  post:async()=>{throw new Error('This action is not available with the mock Google account.');},
  bytes:async()=>{throw new Error('This action is not available with the mock Google account.');},
 };
}
