// Mail drafts are reviewed in Fox; only the trusted native button can send (ported from Hermes mail_actions.py).
// Receipts live behind MailReceipts, keyed by the review's lowercase UUID.
import type {GoogleRest,MailReceipts} from './rest.ts';
import {got,truthy,pyType,pyInt,pyIn,pyIter,pyJson,pyRepr,pySorted,chars,head,strip,WS} from './python.ts';
import {getaddresses} from './addresses.ts';
import {plainMessage,base64} from './mime.ts';

export const SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
const PROFILE='gmail/v1/users/me/profile';
const ADDRESS=new RegExp(`^[^${WS}@,;<>]+@[^${WS}@,;<>]+\\.[^${WS}@,;<>]+$`,'u'),MESSAGE_ID=new RegExp(`^<[^<>${WS}]+@[^<>${WS}]+>$`,'u');

/** The one exact recipient address in `value` (a bare address or `Name <address>`). */
export function address(value:unknown){
 if(typeof value!=='string'||value.includes('\r')||value.includes('\n'))throw new Error('Invalid email address.');
 // Count every address: a comma list is never its first address.
 const parsed=getaddresses(value),one=parsed.length===1?parsed[0]:'';
 if(!ADDRESS.test(one))throw new Error('Provide one exact recipient email address.');
 return one;
}

const GREETING=new RegExp(`^[${WS}]*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))[ ,]+(?:(?:dr|mr|mrs|ms|mx|prof)\\.? +)?([\\p{L}\\p{Nl}\\p{No}][\\p{L}\\p{N}_'\\u2019-]*)`,'iu');
const NOT_NAMES=new Set(['there','all','everyone','team','folks','both','again','guys','y','you','friend','friends','sir','madam']);
/** The name a draft opens with ("Hi Alex," -> Alex), or '' for no or a generic greeting. */
export function greeted(body:string){
 const match=GREETING.exec(body);
 return match&&!NOT_NAMES.has(match[1].toLowerCase())?match[1]:'';
}

const without=(s:string,prefix:string)=>s.startsWith(prefix)?s.slice(prefix.length):s;
const threadOf=(s:string)=>without(without(s,'live:gmail:'),'thread:');
const headersOf=(message:any)=>{const out:Record<string,any>={};for(const h of got(got(message,'payload',{}),'headers',[]))out[h.name.toLowerCase()]=h.value;return out;};

/** A reviewed draft from the turn's `to`, `subject`, `body` and optional reply `threadId` (checked against `sourceIds`). */
export async function prepare(api:GoogleRest,args:any){
 const subject=got(args,'subject',''),body=got(args,'body','');
 if(typeof subject!=='string'||chars(subject)>300||/[\r\n]/.test(subject)||typeof body!=='string'||!(chars(body)>=1&&chars(body)<=30000))throw new Error('Invalid email subject or body.');
 const sender=address(got(await api.get(PROFILE),'emailAddress'));
 const draft:Record<string,any>={from:sender,to:got(args,'to',''),subject,body};
 const rawThread=got(args,'threadId','');
 if(typeof rawThread!=='string')throw new TypeError(`'${pyType(rawThread)}' object has no attribute 'removeprefix'`);
 const thread=threadOf(rawThread);
 if(thread){
  if(!/^[a-fA-F0-9]{1,64}$/.test(thread))throw new Error('Invalid Gmail thread.');
  // A reply's sender and subject come from threadId, so it must be the thread the turn cited.
  const sources=got(args,'sourceIds');
  const cited=new Set(pyIter(truthy(sources)?sources:[]).filter(s=>typeof s==='string'&&(s.startsWith('thread:')||s.startsWith('live:gmail:'))).map(threadOf));
  if(cited.size&&!cited.has(thread))throw new Error('threadId '+thread+' is not among sourceIds '+pySorted(cited).join(', ')+'. Use the Gmail thread ID of the email being replied to.');
  const messages:any[]=got(await api.get('gmail/v1/users/me/threads/'+thread,{format:'metadata',metadataHeaders:['From','Reply-To','To','Cc','Message-ID','References','Subject']}),'messages',[]);
  if(!truthy(messages))throw new Error('The reply thread is empty.');
  const dates=messages.map(m=>pyInt(got(m,'internalDate',0))),latest=messages[dates.indexOf(Math.max(...dates))];
  const headers=headersOf(latest),about=()=>' ('+(got(headers,'subject')||'no subject')+')';
  // The review header (recipient, subject) comes from the thread while the body comes from the model, so a wrong
  // threadId would pair one person's reply with another email's header.
  if(truthy(draft.to)){
   const participants=new Set(messages.flatMap(m=>got(got(m,'payload',{}),'headers',[]).filter(h=>['from','reply-to','to','cc'].includes(h.name.toLowerCase())).flatMap(h=>getaddresses(h.value).map(a=>a.toLowerCase()))));
   if(!participants.has(address(draft.to).toLowerCase()))throw new Error('Recipient '+draft.to+' is not part of thread '+thread+about()+'. Use the Gmail thread ID of the email being replied to, or omit threadId for a new email.');
  }else{
   draft.to=got(headers,'reply-to')||got(headers,'from','');
   const name=greeted(body);
   if(name&&!draft.to.toLowerCase().includes(name.toLowerCase()))throw new Error('The draft greets '+name+' but thread '+thread+' replies to '+draft.to+about()+'. Use the Gmail thread ID of the email being replied to, or give the exact recipient in to.');
  }
  draft.threadId=thread;
  for(const [key,header] of [['inReplyTo','message-id'],['references','references']]){
   const value=got(headers,header,'');
   if(value.includes('\n')||value.includes('\r'))throw new Error('Invalid reply headers.');
   draft[key]=head(value,2000);
  }
  // Gmail groups replies using both the thread and matching subject.
  draft.subject=got(headers,'subject')||subject;
 }
 draft.to=address(draft.to);
 if(draft.to.toLowerCase()===sender.toLowerCase()&&!truthy(got(args,'to')))throw new Error('The latest message is yours. Please specify the recipient explicitly.');
 return draft;
}

/** The receipt key of a review: its UUID in any letter case, canonical and lowercase. */
function receiptId(identifier:unknown){
 if(identifier===null||identifier===undefined)throw new TypeError('one of the hex, bytes, bytes_le, fields, or int arguments must be given');
 if(typeof identifier!=='string')throw new TypeError(`'${pyType(identifier)}' object has no attribute 'replace'`);
 const hex=identifier.replaceAll('urn:','').replaceAll('uuid:','').replace(/^[{}]+|[{}]+$/g,'').replaceAll('-','');
 if(chars(hex)!==32)throw new Error('badly formed hexadecimal UUID string');
 const number=strip(hex);
 if(!/^[+-]?(?:0[xX])?_?[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/.test(number))throw new Error('invalid literal for int() with base 16: '+pyRepr(hex));
 if(number[0]==='-'&&/[1-9a-fA-F]/.test(number.replace(/^-(?:0[xX])?/,'')))throw new Error('int is out of range (need a 128-bit value)');
 const canonical=/^[0-9a-fA-F]{32}$/.test(hex)?hex.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})/,'$1-$2-$3-$4-'):'';
 if(canonical!==identifier.toLowerCase())throw new Error('Invalid mail review ID.');
 return canonical;
}

/** sha256 of the draft as Python's json.dumps(sort_keys=True, ensure_ascii=False) writes it, hex. */
export async function draftHash(draft:unknown){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pyJson(draft))));
 return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function reviewedSender(api:GoogleRest,draft:any){
 const sender=address(got(await api.get(PROFILE),'emailAddress'));
 if(sender.toLowerCase()!==address(got(draft,'from')).toLowerCase())throw new Error('Google account changed. Prepare a new draft.');
 return sender;
}

/** Read-only reconciliation. A missing search result NEVER authorizes resending. */
export async function reconcile(api:GoogleRest,receipts:MailReceipts,draft:any,identifier:string){
 const key=receiptId(identifier);
 const sender=await reviewedSender(api,draft);
 const previous=receipts.read(key);
 if(!previous)return {status:'unknown',reason:'no_receipt'};
 // Old receipts cannot be safely matched to a reviewed message/account.
 if(got(previous,'sender')!==sender.toLowerCase()||got(previous,'draftHash')!==await draftHash(draft))return {status:'unknown',reason:'unmatched_receipt'};
 if(got(previous,'status')==='sent')return previous;
 const messageId=got(previous,'rfcMessageId','');
 if(typeof messageId!=='string'||!MESSAGE_ID.test(messageId))return {status:'unknown',reason:'missing_message_id'};
 // Gmail documents rfc822msgid search. Verify exact metadata and Sent label too.
 const result=await api.get('gmail/v1/users/me/messages',{q:'rfc822msgid:'+messageId,labelIds:['SENT'],maxResults:10});
 for(const candidate of got(result,'messages',[])){
  const message=await api.get('gmail/v1/users/me/messages/'+encodeURIComponent(candidate.id),{format:'metadata',metadataHeaders:['Message-ID','From','To']});
  const headers=headersOf(message);
  if(!pyIn('SENT',got(message,'labelIds',[]))||got(headers,'message-id')!==messageId
   ||address(got(headers,'from','')).toLowerCase()!==sender.toLowerCase()
   ||address(got(headers,'to','')).toLowerCase()!==address(draft.to).toLowerCase())continue;
  const value={...previous,ok:true,status:'sent',messageId:message.id,threadId:got(message,'threadId','')};
  receipts.write(key,value);return value;
 }
 return {status:'unknown',reason:'not_found_yet'};
}

/** Sends a reviewed draft once. The receipt is created before dispatch, so a second attempt never sends a copy.
 * The Message-ID is `<centiseconds.random.identifier@worldlet.local>`; `now` is milliseconds since 1970. */
export async function send(api:GoogleRest,receipts:MailReceipts,draft:any,identifier:string,now=Date.now()){
 const key=receiptId(identifier);
 const sender=await reviewedSender(api,draft);
 const attempted='Sending was already attempted. Check delivery; do not send another copy while the result is uncertain.';
 if(receipts.read(key)){
  const previous=await reconcile(api,receipts,draft,identifier);
  if(got(previous,'status')==='sent')return previous;
  throw new Error(attempted);
 }
 const random=crypto.getRandomValues(new Uint32Array(2)),messageId=`<${Math.floor(now/10)}.${BigInt(random[0])<<32n|BigInt(random[1])}.${identifier}@worldlet.local>`;
 const reply=truthy(got(draft,'inReplyTo'));
 const raw=plainMessage({from:sender,to:address(draft.to),subject:draft.subject,messageId,
  ...(reply?{inReplyTo:draft.inReplyTo,references:[got(draft,'references'),draft.inReplyTo].filter(truthy).join(' ')}:{})},draft.body);
 const payload:Record<string,string>={raw:base64(raw).replace(/\+/g,'-').replace(/\//g,'_')};
 if(truthy(got(draft,'threadId')))payload.threadId=draft.threadId;
 const pending={status:'sending',sender:sender.toLowerCase(),draftHash:await draftHash(draft),rfcMessageId:messageId};
 // Exclusive creation prevents concurrent duplicate sends; persist identity before dispatch.
 if(!receipts.create(key,pending))throw new Error(attempted);
 const result=await api.post('gmail/v1/users/me/messages/send',payload);
 if(!truthy(got(result,'id')))throw new Error('Delivery status is unknown. Check delivery; do not send again.');
 const value={...pending,ok:true,status:'sent',messageId:result.id,threadId:got(result,'threadId','')};
 receipts.write(key,value);return value;
}
