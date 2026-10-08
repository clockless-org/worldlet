import {characters} from './companion-text.ts';
/** Host bounds encoded bytes and owns storage/consent; core validates record shape. */
export function validateConversationHistory(value:unknown,writing:boolean):void {
 if(!Array.isArray(value)||value.length>80||!value.every(v=>v!==null&&typeof v==='object'&&!Array.isArray(v)))
  throw Error(writing?'Invalid conversation history.':'Saved conversation history is invalid.');
 if(writing&&!value.every(row=>[['key',500],['view',500],['text',12000]].every(([key,max])=>typeof row[key]==='string'&&characters(row[key]).length<=Number(max))))
  throw Error('Conversation history is too large.');
 // The thread row carries bounded turn entries (question, answer, steps, place).
 if(writing&&!value.every(row=>row.entries===undefined||Array.isArray(row.entries)&&row.entries.length<=150&&row.entries.every(e=>e&&typeof e==='object'&&['user','text'].every(k=>typeof e[k]==='string'&&characters(e[k]).length<=12000)&&(e.steps===undefined||Array.isArray(e.steps)&&e.steps.length<=20))))
  throw Error('Conversation history is too large.');
}
