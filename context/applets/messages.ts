// Messages (iMessage on a Mac): the shared rules the host's adapter follows. The host talks to the pinned
// imsg release (github.com/openclaw/imsg) over `imsg rpc`, which reads Apple's local `chat.db` and sends
// through the Messages app itself, so a message goes out under the person's own Apple ID and never through a
// Worldlet server. These rules turn imsg's JSON into what the Applet shows; nothing here touches files or apps.

export const MESSAGES_LIMITS={conversations:50,thread:60,text:10_000,snippet:90,participants:20,attachments:10} as const;

/** A phone number or an email address someone can be messaged at, normalized; null when it is neither. */
export function messagesRecipient(value:unknown):string|null {
 if(typeof value!=='string')return null;
 const raw=value.trim();
 if(!raw||raw.length>254)return null;
 if(raw.includes('@'))return /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>".]{2,}$/.test(raw)?raw.toLowerCase():null;
 if(!/^\+?[0-9 ()\-.]{3,24}$/.test(raw))return null;
 const digits=raw.replace(/\D/g,'');
 if(digits.length<3||digits.length>15)return null;
 return (raw.startsWith('+')?'+':'')+digits;
}

/** The words to send: present, within the limit and free of control characters other than line breaks and tabs. */
export function messagesOutgoingText(value:unknown):string|null {
 if(typeof value!=='string')return null;
 const text=value.replace(/\r\n?/g,'\n');
 if(!text.trim()||Array.from(text).length>MESSAGES_LIMITS.text)return null;
 // eslint-disable-next-line no-control-regex
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text))return null;
 return text;
}

/** A conversation's name: the group name someone gave it, else who is in it. */
export function messagesConversationTitle(displayName:unknown,participants:string[],identifier:unknown):string {
 if(typeof displayName==='string'&&displayName.trim())return displayName.trim();
 const people=participants.filter(Boolean);
 if(people.length===1)return people[0];
 if(people.length>1)return people.slice(0,3).join(', ')+(people.length>3?` +${people.length-3}`:'');
 return typeof identifier==='string'&&identifier?identifier:'Conversation';
}

/** One short line for a conversation card: who spoke last and what they said. */
export function messagesSnippet(text:string,fromMe:boolean):string {
 const line=text.replace(/\s+/g,' ').trim();
 const cut=Array.from(line);
 const short=cut.length>MESSAGES_LIMITS.snippet?cut.slice(0,MESSAGES_LIMITS.snippet-1).join('')+'…':line;
 return (fromMe?'You: ':'')+short;
}

const str=(value:unknown)=>typeof value==='string'?value:'';
const when=(value:unknown)=>{const at=Date.parse(str(value));return Number.isFinite(at)?at:null;};

/** One conversation from imsg's `chats.list`: its portable guid, the local row id imsg reads it by and its name.
 * A one-to-one chat takes the person's Contacts name when Worldlet may read Contacts. */
export interface MessagesConversation {guid:string;chat:number;title:string;participants:string[];at:number|null;group:boolean}
export function messagesConversation(value:unknown):MessagesConversation|null {
 const chat=value&&typeof value==='object'?value as Record<string,unknown>:null;
 if(!chat||!Number.isSafeInteger(chat.id)||Number(chat.id)<=0||!str(chat.guid))return null;
 const participants=(Array.isArray(chat.participants)?chat.participants:[]).filter((p):p is string=>typeof p==='string'&&!!p).slice(0,MESSAGES_LIMITS.participants);
 const group=chat.is_group===true;
 const title=messagesConversationTitle(str(chat.display_name)||(!group?str(chat.contact_name):''),participants,str(chat.identifier)||str(chat.name));
 return {guid:str(chat.guid),chat:Number(chat.id),title,participants,at:when(chat.last_message_at),group};
}

/** A file someone sent, as imsg lists it. `file` stays in the host; the Applet only sees the name. */
export interface MessagesAttachment {name:string;mime:string;bytes:number;missing:boolean;file:string}
/** One message from imsg's `messages.history` or `watch.subscribe`, as a bubble; null for a row with
 * nothing to show. U+FFFC stands where an attachment sits inside the text. */
export interface MessagesLine {id:string;row:number;fromMe:boolean;sender:string;text:string;at:number|null;attachments:MessagesAttachment[]}
export function messagesLine(value:unknown):MessagesLine|null {
 const message=value&&typeof value==='object'?value as Record<string,unknown>:null;
 if(!message||!Number.isSafeInteger(message.id)||message.is_reaction===true)return null;
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]).flatMap(item=>{
  const a=item&&typeof item==='object'?item as Record<string,unknown>:null;
  if(!a)return [];
  const file=str(a.original_path)||str(a.filename);
  const name=str(a.transfer_name)||file.split('/').pop()||'Attachment';
  return [{name,mime:str(a.mime_type),bytes:Number.isSafeInteger(a.total_bytes)?Number(a.total_bytes):0,missing:a.missing===true||!file,file}];
 }).slice(0,MESSAGES_LIMITS.attachments);
 const text=str(message.text).replace(/￼/g,'').trim();
 if(!text&&!attachments.length)return null;
 const fromMe=message.is_from_me===true;
 return {id:str(message.guid)||String(message.id),row:Number(message.id),fromMe,sender:fromMe?'':str(message.sender_name)||str(message.sender),text,at:when(message.created_at),attachments};
}

/** What a failed imsg `send` means for the person. imsg's RPC says whether the Messages app was ever asked
 * to send (`disposition`): only `not_started` proves nothing went out, so only then may the same words be
 * sent again without checking Messages. -1743 is macOS refusing Worldlet control of Messages (Automation);
 * -32002 is chat.db out of reach (Full Disk Access). */
export function messagesSendFailure(error:{code?:unknown;data?:unknown}):'automation'|'full-disk'|'not-sent'|'unconfirmed' {
 const data=error.data&&typeof error.data==='object'?error.data as Record<string,unknown>:{};
 const detail=typeof error.data==='string'?error.data:str(data.detail);
 if(error.code===-32002)return 'full-disk';
 if(data.disposition==='not_started'){
  return /-1743\b|not authori[sz]ed to send apple events/i.test(detail)?'automation':'not-sent';
 }
 // Invalid params and unknown methods are refused before anything reaches Messages.
 if(error.code===-32602||error.code===-32601||error.code===-32600||error.code===-32700)return 'not-sent';
 return 'unconfirmed';
}

/** What the World keeps of a message sent from Worldlet (`sent_messages` in world.sqlite). `unconfirmed`
 * means Messages may or may not have sent it; `guid` is the sent message in Messages when imsg saw it. */
export interface SentMessageRecord {id:string;at:string;chat:string;to:string;title:string;text:string;status:'sending'|'sent'|'failed'|'unconfirmed';guid?:string;error?:string}
export function validSentMessageId(value:unknown):value is string {return typeof value==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(value);}
