import type {WorldItem,WorldItemDates} from '../../contracts/world-item.ts';
import {characters} from '../companion/index.ts';
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
// Foundation whitespacesAndNewlines includes NEL and zero-width space, unlike JS trim.
const blank=(s:string)=>/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]*$/u.test(s);
// A grouping identity is a local, minimal, masked label: never a URL, full email,
// long number, credential or payment detail. Every subject word and masked digit
// run must appear in the cited quotes, so two items can only share a subject when
// both ground the same institution or merchant and mask.
const words=(s:string)=>s.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
export function attentionEventError(event:unknown,sources:unknown):string|undefined {
 if(event===undefined)return undefined;
 if(!record(event)||Object.keys(event).some(k=>k!=='topic'&&k!=='subject'))return 'Attention event must be {topic, subject}; omit event when identity is uncertain.';
 for(const [key,max] of [['topic',40],['subject',80]] as const){
  const value=event[key];
  if(typeof value!=='string'||blank(value)||characters(value).length>max||/[\r\n]/.test(value))return `Attention event ${key} must be a short single-line label (${max} characters maximum).`;
  if(/https?:|:\/\/|www\./i.test(value)||/\d(?:[\s.-]?\d){4}/.test(value)||(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}/u.test(value)&&!/[*•]/.test(value))
   ||/\b(password|passcode|pin|otp|verification code|token|secret|api key|cvv|cvc|ssn)\b/i.test(value))
   return `Attention event ${key} must not contain links, full addresses, account or card numbers, codes or credentials; use a masked label such as "Example Bank card ending 1234".`;
 }
 const quotes=(Array.isArray(sources)?sources:[]).map(ref=>record(ref)&&typeof ref.quote==='string'?ref.quote:'').join('\n').normalize('NFC').toLowerCase();
 const tokens=words(event.subject as string);
 if(tokens.some(t=>!quotes.includes(t))||!tokens.some(t=>/\p{L}/u.test(t)))
  return 'Attention event subject must name the account, merchant or incident using only words and masked digits quoted in its cited sources; omit event when identity is uncertain.';
 return undefined;
}
export function validateWorldItem(item:WorldItem,dates:WorldItemDates):void {
 const field=(key:string,max:number):string=>{
  const value=item[key];
  if(typeof value!=='string'||blank(value)||characters(value).length>max)throw Error(`Invalid world item: ${key}.`);
  return value;
 };
 field('provider',64);const kind=field('kind',16);
 field('title',200);field('context',1200);
 if(kind==='task')field('attentionReason',600);
 if(item.eventDisposition!==undefined&&!['confirmed','important','optional'].includes(item.eventDisposition as string))throw Error('Invalid event disposition.');
 if(item.priority!==undefined&& !['normal','elevated','important','high','urgent'].includes(item.priority as string))throw Error('Invalid world item: priority.');
 if(!['task','event','update'].includes(kind)||!Array.isArray(item.sources)||!item.sources.length||item.sources.length>8||!item.sources.every(record))
  throw Error('A world item needs source references.');
 for(const ref of item.sources){
  if(typeof ref.id!=='string'||!ref.id.length||characters(ref.id).length>500||typeof ref.provider!=='string'||!ref.provider.length||typeof ref.quote!=='string'||!ref.quote.length||characters(ref.quote).length>1000)
   throw Error('Invalid source evidence.');
  if(typeof ref.url==='string'&&characters(ref.url).length>2000)throw Error('Invalid source link.');
 }
 if(attentionEventError(item.event,item.sources))throw Error('Invalid world item: event.');
 const valid=(value:number|null)=>typeof value==='number'&&Number.isFinite(value);
 if(kind==='event'&&!valid(dates.start))throw Error('Events need a date and time zone.');
 if(typeof item.end==='string'&&(!valid(dates.start)||!valid(dates.end)||dates.end!<dates.start!))throw Error('Invalid event end time.');
}
