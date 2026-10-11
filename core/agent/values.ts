// Small readers the Agent rules here share for values read from an Agent's files and streams. Internal to core/agent
// (not re-exported from index.ts). Kept ES-compatible for JavaScriptCore and Jint.

/** An object's fields, or `{}` for anything that is not a plain object. */
export const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
/** A string trimmed, or '' for anything else. */
export const text=(value:unknown)=>typeof value==='string'?value.trim():'';
/** At most `limit` characters, a cut one ending in `…`. */
export const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
/** An ISO time from epoch seconds, milliseconds or a date string, without fractional seconds; null when unknown. */
export const iso=(value:unknown):string|null=>{
 const date=typeof value==='number'&&Number.isFinite(value)?new Date(value<1e12?value*1000:value):typeof value==='string'&&value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toISOString().replace(/\.\d+Z$/,'Z'):null;
};
/** A routine interval in whole minutes as Hermes cron writes it: `every 2d`, `every 3h` or `every 45m`. */
export const everyMinutes=(minutes:number)=>minutes%1440===0?'every '+minutes/1440+'d':minutes%60===0?'every '+minutes/60+'h':'every '+minutes+'m';
/** FNV-1a (32-bit) over a string's UTF-16 code units. */
export function fnv1a(value:string):number {
 let hash=0x811c9dc5;
 for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}
 return hash;
}
