import type {CompanionArchive,CompanionRecallResult} from '../../contracts/companion.ts';

import {characters,utf8Length} from './companion-text.ts';

/** Pure retrieval. Hosts load archives and authorize access before calling. */
export function recallCompanion(archive:CompanionArchive,args:Record<string,unknown>={}):CompanionRecallResult {
 const query=args.query??'',id=args.id??'',offset=args.offset??0;
 if(typeof query!=='string'||typeof id!=='string'||typeof offset!=='number'||!Number.isInteger(offset)||
  utf8Length(query)>1000||characters(id).length>160||offset<0||offset>1000000||
  Object.keys(args).some(k=>!['query','id','offset'].includes(k)))throw Error('Invalid companion recall request.');
 const rows:Record<string,unknown>[]=[
  ...(archive.memoryAuthority==='worldlet'?archive.memories.map(m=>({...m})):[]),
  ...[...archive.conversations].reverse().map(t=>({...t,kind:'conversation'}))
 ];
 if(id){
  const row=rows.find(r=>r.id===id);if(!row)throw Error('Companion record not found.');
  const chars=characters(row.text as string);if(offset>chars.length)throw Error('Companion text offset is out of range.');
  const next=Math.min(chars.length,offset+3000);
  return {records:[{...row,text:chars.slice(offset,next).join(''),offset,...(next<chars.length?{nextOffset:next}:{})}],referenceOnly:true};
 }
 const matching=rows.filter(r=>(r.text as string).toLowerCase().includes(query.toLowerCase()));
 if(offset>matching.length)throw Error('Companion result offset is out of range.');
 const records=matching.slice(offset,offset+5).map(row=>{const chars=characters(row.text as string);return {...row,text:chars.slice(0,600).join(''),truncated:chars.length>600};});
 return {records,total:matching.length,referenceOnly:true,memoryAuthority:archive.memoryAuthority,...(offset+records.length<matching.length?{nextOffset:offset+records.length}:{})};
}
