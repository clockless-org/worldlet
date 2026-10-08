import type {CompanionArchive} from '../../contracts/companion.ts';
import policy from '../../contracts/companion-policy.json' with {type:'json'};
import {characters,utf8Length} from './companion-text.ts';
const pattern=(text:string)=>new RegExp(text.replace(/\\z$/, '(?![\\s\\S])'));
const timestamp=pattern(policy.timestampPattern),uuid=pattern(policy.uuidPattern);
export function validCompanionID(value:unknown):boolean {return typeof value==='string'&&uuid.test(value);}
export function validCompanionTimestamp(value:unknown):boolean {
 if(typeof value!=='string'||!timestamp.test(value))return false;
 const [year,month,day]=value.slice(0,10).split('-').map(Number);
 const days=[31,(year%4===0&&(year%100!==0||year%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid companion profile.');return value as Record<string,unknown>;}
function text(value:unknown,max:number,bytes=false):boolean {return typeof value==='string'&&(bytes?utf8Length(value):characters(value).length)<=max;}
export function validateCompanionArchive(value:unknown):CompanionArchive {
 const a=object(value),identity=object(a.identity);
 if(a.format!==policy.format||a.version!==policy.version)throw Error('Unsupported companion archive version.');
 if(!validCompanionID(identity.id)||!text(identity.name,policy.maxNameLength)||!(identity.name as string).trim()||
  !validCompanionTimestamp(identity.createdAt)||!text(a.personality,policy.maxPersonalityBytes,true)||
  (typeof a.memoryAuthority!=='string'||!pattern(policy.memoryAuthorityPattern).test(a.memoryAuthority))||!Array.isArray(a.memories)||!Array.isArray(a.conversations)||
  a.memories.length>policy.maxMemories||a.conversations.length>policy.maxConversations)throw Error('Invalid companion profile.');
 const memories=new Set<string>(),turns=new Set<string>();
 for(const value of a.memories){const m=object(value);
  if(!text(m.id,policy.maxMemoryIdLength)||!m.id||memories.has((m.id as string).normalize('NFC'))||
   !['user','longTerm','soul'].includes(m.kind as string)||!text(m.text,policy.maxMemoryBytes,true)||!text(m.source,policy.maxSourceLength))throw Error('Invalid companion memories or conversation records.');
  memories.add((m.id as string).normalize('NFC'));
 }
 for(const value of a.conversations){const t=object(value);
  if(!validCompanionID(t.id)||turns.has(t.id as string)||!['user','assistant'].includes(t.role as string)||
   !text(t.session,policy.maxSessionLength)||!text(t.text,policy.maxTurnBytes,true)||!validCompanionTimestamp(t.createdAt))throw Error('Invalid companion memories or conversation records.');
  turns.add(t.id as string);
 }
 if(utf8Length(JSON.stringify(a))>policy.maxArchiveBytes)throw Error('Companion archive exceeds 16 MB.');
 return a as unknown as CompanionArchive;
}
export function shouldRotateCompanion(count:number):boolean {
 if(!Number.isInteger(count)||count<0||count>policy.maxConversations)throw Error('Invalid companion history count.');
 return count>=policy.rotateAfterTurns;
}
