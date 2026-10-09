// Source pages as the records chat and checks read: one shape per provider, at most 50 records of 12,000 characters
// (ported from Hermes source_reader.py `normalize` and `source_failure`).
import {got,truthy,pyIn,pyIter,pyInt,pyStr,pySorted,chars,head,urlsafeB64decode} from './python.ts';
import {unescape} from './html.ts';

const TEXT=12000;
function strings(value:any):string{
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(strings).join('\n');
 if(value!==null&&typeof value==='object')return pySorted(Object.keys(value)).map(k=>strings(value[k])).join('\n');
 return '';
}
const utf8=new TextDecoder('utf-8',{ignoreBOM:true});
function mail(part:any):string{
 if(got(part,'mimeType')==='text/plain'||!truthy(got(part,'parts'))){
  const raw=got(got(part,'body')||{},'data','');
  return truthy(raw)?utf8.decode(urlsafeB64decode(raw+'='.repeat((4-raw.length%4)%4))):'';
 }
 const parts:any[]=got(part,'parts',[]),plain=parts.filter(p=>got(p,'mimeType')!=='text/html');
 return plain.length?plain.map(mail).join('\n'):unescape(parts.map(mail).join('\n').replace(/<[^>]+>/g,' '));
}
const labels=(m:any)=>got(m,'labelIds',[]);
const date=(m:any)=>pyInt(got(m,'internalDate',0));

/** Validated records of one provider's read (gmail, google-calendar, notion, or any other source). */
export function normalize(provider:string,result:any){
 const rows=got(result,'records',got(result,'pages'));
 if(truthy(got(result,'error'))||got(result,'ok')===false||!Array.isArray(rows))throw new Error('Source did not return valid records.');
 const records=[];
 for(const row of rows.slice(0,50)){
  const data=got(row,'data',row);
  let identifier=got(row,'id');
  if(typeof identifier!=='string'||!identifier)throw new Error('Missing source identity.');
  let title=got(data,'title',got(data,'summary',provider)),url=got(data,'htmlLink',got(data,'url','')),text=strings(data);
  let metadata:Record<string,any>={metadataOnly:truthy(got(result,'metadataOnly'))};
  if(provider==='google-calendar'){
   // Never flatten calendar fields: alphabetical order puts end before start.
   // Keep provider timestamps authoritative, including their UTC offsets.
   const start=got(data,'start',{}),end=got(data,'end',{}),attendees:any[]=got(data,'attendees',[]);
   Object.assign(metadata,{start:got(start,'dateTime',got(start,'date','')),end:got(end,'dateTime',got(end,'date','')),
    allDay:pyIn('date',start),cancelled:got(data,'status')==='cancelled'||attendees.some(a=>truthy(got(a,'self'))&&got(a,'responseStatus')==='declined')});
   const self=attendees.find(a=>truthy(got(a,'self')));
   text=['Title: '+pyStr(title),'Start: '+metadata.start,'End: '+metadata.end,'Time zone: '+got(start,'timeZone',''),'Status: '+got(data,'status',''),
    'Location: '+got(data,'location',''),'Your response: '+(self?got(self,'responseStatus',''):''),'Description: '+got(data,'description','')].join('\n');
  }
  if(provider==='notion'){
   // An index's title/URL is discovery metadata, not the fetched page body.
   const original=got(data,'markdown');
   text=typeof original==='string'?original:'';
   metadata={metadataOnly:typeof original!=='string',partial:truthy(got(data,'partial'))||chars(text)>TEXT};
  }
  if(provider==='gmail'){
   let messages:any[]=got(got(data,'thread',{}),'messages',[data]);
   // The user's own workflow: a thread with any message in the inbox is kept there; one whose observed messages
   // are all outside it is archived. No labels, no placement.
   const labelled=messages.filter(m=>Array.isArray(got(m,'labelIds')));
   const placement=labelled.length?(labelled.some(m=>m.labelIds.includes('INBOX'))?'inbox':'archived'):null;
   if(truthy(got(result,'unreadOnly')))messages=messages.filter(m=>pyIn('UNREAD',labels(m)));
   messages=messages.map(m=>[date(m),m] as const).sort((a,b)=>b[0]-a[0]).map(([,m])=>m);
   const threadId=[got(got(data,'thread',{}),'id'),got(data,'threadId')].find(truthy)??identifier.replace(/^thread:/,'');
   identifier='thread:'+threadId;
   metadata={...metadata,labelIds:pySorted(new Set(messages.flatMap(m=>pyIter(labels(m))).filter(l=>l==='CATEGORY_PROMOTIONS'||l==='SPAM'))),threadId,
    messageCount:messages.length,unread:messages.some(m=>pyIn('UNREAD',labels(m))),receivedAt:messages.reduce((n,m)=>Math.max(n,date(m)),messages.length?-Infinity:0)};
   if(placement)metadata.mailPlacement=placement;
   metadata.allMessagesExcluded=messages.length>0&&messages.every(m=>pyIter(labels(m)).some(l=>l==='SPAM'||l==='TRASH'));
   const segments=messages.slice(0,8).map((message,i)=>{
    const payload=got(message,'payload',{}),headers:Record<string,any>={};
    for(const h of got(payload,'headers',[]))headers[got(h,'name','').toLowerCase()]=got(h,'value','');
    if(i===0){title=got(headers,'subject','No subject');Object.assign(metadata,{from:got(headers,'from',''),date:got(headers,'date','')});}
    const direction=pyIn('SENT',labels(message))?'SENT BY USER':'RECEIVED';
    const body=mail(payload)||unescape(got(message,'snippet',''));
    return [direction,'Status: '+(pyIn('UNREAD',labels(message))?'UNREAD':'READ'),'Date: '+got(headers,'date',''),'From: '+got(headers,'from',''),'Subject: '+got(headers,'subject',''),head(body,TEXT)].join('\n');
   });
   // The newest received message's own picture, if it has one.
   const picture=messages.find(m=>{const p=got(m,'picture');return p!==null&&typeof p==='object'&&!Array.isArray(p)&&!pyIn('SENT',labels(m));})?.picture;
   if(truthy(picture)&&typeof got(picture,'src')==='string')metadata.image=picture.src;
   metadata.partial=truthy(got(got(data,'thread',{}),'messagesOmitted'))||messages.length>8||messages.some(m=>truthy(got(m,'excerptTruncated')));
   text='Thread, newest first. User: '+got(data,'userEmail','')+'\n\n'+segments.join('\n\n---\n\n');
   url='https://mail.google.com/mail/u/0/#all/'+threadId;
  }
  if(chars(text)>TEXT)metadata.partial=true;
  records.push({provider,id:identifier,title,url,text:head(text,TEXT),...metadata});
 }
 return records;
}

const FAILURES:Record<string,string>={
 source_not_found:"This source record was not found. Use the provider record ID from the saved item's sources, not its Worldlet item ID. Query the item or list recent mail to recover the correct source.",
 invalid_request:'The source request is invalid. Check the provider source ID and arguments; do not use a Worldlet attention item ID.',
 authorization_required:'Source authorization expired. Reconnect the account with Fox.',
 access_denied:"The source denied access. Check the connected account's permissions.",
 rate_limited:'The source is limiting requests. Wait before retrying.',
};
/** The person-facing reason of a failed read. Only classified codes cross this boundary, never provider bodies or URLs. */
export function sourceFailure(events:any[]){
 const code=events.find(e=>got(e,'type')==='error');
 const key=code===undefined?undefined:got(code,'code');
 return typeof key==='string'&&Object.hasOwn(FAILURES,key)?FAILURES[key]:'The source is temporarily unavailable. Retry the read.';
}
