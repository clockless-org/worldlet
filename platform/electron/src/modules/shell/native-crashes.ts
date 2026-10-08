import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Row} from '../../host/types.ts';

/** Native crash reports written since the last look (core/diagnostics/ANALYTICS.md#native-crashes): on macOS the
 * system's own reports of Worldlet's processes, already unwound; on Windows the Crashpad minidumps in the library's
 * logs (main.ts), of which only the crash address is read. At most `limit`, oldest first. */
export function nativeCrashes({since,dumps,system=process.platform,reports=path.join(os.homedir(),'Library','Logs','DiagnosticReports'),limit=5}:
 {since:number,dumps:string,system?:NodeJS.Platform,reports?:string,limit?:number}):{at:number,kind:'ips'|'minidump',file:string}[] {
 const found:{at:number,kind:'ips'|'minidump',file:string}[]=[];
 const look=(dir:string,depth:number,match:(name:string)=>boolean,kind:'ips'|'minidump')=>{
  let entries:fs.Dirent[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory()&&depth>0)look(file,depth-1,match,kind);
   else if(entry.isFile()&&match(entry.name))try{const stat=fs.statSync(file);if(stat.mtimeMs>since&&stat.size<8*1024*1024)found.push({at:stat.mtimeMs,kind,file});}catch{}
  }
 };
 if(system==='darwin')look(reports,0,name=>/^Worldlet( Helper[^-]*)?-[\d-]+\.ips$/.test(name),'ips');
 else if(system==='win32')look(dumps,3,name=>name.endsWith('.dmp'),'minidump');
 return found.sort((a,b)=>a.at-b.at).slice(-limit);
}

/** Exception code, crash address and module of a Windows minidump (MINIDUMP_EXCEPTION_STREAM, MINIDUMP_MODULE_LIST),
 * plus the app's own file version: the input of Core's nativeCrashReport. Anything malformed → null. */
export function minidumpCrash(bytes:Uint8Array):Row|null {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u32=(at:number)=>view.getUint32(at,true),u64=(at:number)=>Number(view.getBigUint64(at,true));
 try{
  if(u32(0)!==0x504d444d)return null;
  const streams=new Map<number,number>();
  for(let i=0,count=u32(8),dir=u32(12);i<count&&i<64;i++)streams.set(u32(dir+i*12),u32(dir+i*12+8));
  const exception=streams.get(6),list=streams.get(4);
  if(exception==null||list==null)return null;
  const code=u32(exception+8).toString(16).padStart(8,'0'),address=u64(exception+24);
  const modules:{name:string,base:number,size:number,version:string}[]=[];
  for(let i=0,count=Math.min(u32(list),1000);i<count;i++){
   const at=list+4+i*108,name=u32(at+20),length=u32(name);
   const full=new TextDecoder('utf-16le').decode(bytes.subarray(name+4,name+4+Math.min(length,1024)));
   const ms=u32(at+24+8),ls=u32(at+24+12);
   modules.push({name:full.slice(full.lastIndexOf('\\')+1),base:u64(at),size:u32(at+8),version:u32(at+24)===0xfeef04bd?`${ms>>>16}.${String(ms&0xffff).padStart(4,'0')}.${ls>>>16}`:''});
  }
  const hit=modules.find(module=>address>=module.base&&address<module.base+module.size);
  return {program:modules[0]?.name,code,arch:'x64',build:modules[0]?.version??'',frames:hit?[{module:hit.name,offset:address-hit.base}]:[]};
 }catch{return null;}
}
