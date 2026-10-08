#!/usr/bin/env node
// Native crash frames (`Electron Framework+0x90b413c`, PostHog error_code nativeCrash) → function and source line,
// from the Breakpad symbols Electron publishes with each release (core/diagnostics/ANALYTICS.md#native-crashes).
// Usage: node scripts/crash-symbols.ts --electron 44.5.1 [--platform darwin-arm64|darwin-x64|win32-x64]
//          [--module "Electron Framework"] [--id <crash_module_id>] 0x90b413c 0x45e540 …
// The symbols (about 130 MB zipped) are cached in ~/.cache/worldlet/electron-symbols.
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const args=process.argv.slice(2),option=(name:string,fallback='')=>{const at=args.indexOf('--'+name);if(at<0)return fallback;const value=args[at+1];args.splice(at,2);return value;};
const electron=option('electron'),platform=option('platform','darwin-arm64'),id=option('id').replace(/-/g,'').toUpperCase();
let module=option('module',platform.startsWith('win32')?'electron.exe':'Electron Framework');
// The Windows app renames electron.exe; its symbols keep Electron's name.
if(module==='Worldlet.exe')module='electron.exe';
const offsets=args.map(value=>Number.parseInt(value.replace(/^.*\+/,''),16)).filter(Number.isSafeInteger);
if(!/^\d+\.\d+\.\d+$/.test(electron)||!/^(darwin|mas)-(arm64|x64)$|^win32-(x64|arm64|ia32)$/.test(platform)||!offsets.length){
 console.error('Usage: node scripts/crash-symbols.ts --electron 44.5.1 [--platform darwin-arm64] [--module "Electron Framework"] [--id UUID] 0x90b413c …');process.exit(2);
}
const name=`electron-v${electron}-${platform}-symbols.zip`,cache=path.join(os.homedir(),'.cache','worldlet','electron-symbols'),zip=path.join(cache,name);
if(!fs.existsSync(zip)){
 fs.mkdirSync(cache,{recursive:true});
 console.error(`Downloading ${name}…`);
 const got=spawnSync('curl',['-fsSL','-o',zip+'.part',`https://github.com/electron/electron/releases/download/v${electron}/${name}`],{stdio:'inherit'});
 if(got.status!==0){fs.rmSync(zip+'.part',{force:true});console.error('Download failed.');process.exit(1);}
 fs.renameSync(zip+'.part',zip);
}
const unzip=spawn('unzip',['-p',zip,`breakpad_symbols/${module}/*`],{stdio:['ignore','pipe','inherit']});
const files=new Map<number,string>(),origins=new Map<number,string>();
const found=new Map<number,{name:string,line:string,inlined:string[]}>();
// Return addresses (every frame but the crashing one) point after the call: look up the byte before them.
const wanted=offsets.map((offset,index)=>({offset,at:index===0?offset:offset-1}));
let current:{start:number,end:number,name:string,hits:{offset:number,at:number}[]}|null=null,moduleId='';
const inlines:{hit:number,depth:number,line:number,file:number,origin:number}[]=[];
for await (const text of readline.createInterface({input:unzip.stdout})){
 if(text.startsWith('MODULE ')){moduleId=text.split(' ')[3]??'';continue;}
 if(text.startsWith('FILE ')){const [,index,...rest]=text.split(' ');files.set(Number(index),rest.join(' '));continue;}
 if(text.startsWith('INLINE_ORIGIN ')){const [,index,...rest]=text.split(' ');origins.set(Number(index),rest.join(' '));continue;}
 if(text.startsWith('FUNC ')){
  const parts=text.split(' ');if(parts[1]==='m')parts.splice(1,1);
  const start=Number.parseInt(parts[1],16),end=start+Number.parseInt(parts[2],16);
  const hits=wanted.filter(item=>item.at>=start&&item.at<end);
  current=hits.length?{start,end,name:parts.slice(4).join(' '),hits}:null;
  for(const hit of hits)found.set(hit.offset,{name:current!.name,line:'',inlined:[]});
  continue;
 }
 if(text.startsWith('PUBLIC ')||text.startsWith('STACK ')){current=null;continue;}
 if(!current)continue;
 if(text.startsWith('INLINE ')){
  const parts=text.split(' ').slice(1).map(value=>value);
  const [depth,line,file,origin]=parts.slice(0,4).map(Number);
  for(let i=4;i+1<parts.length;i+=2){const start=Number.parseInt(parts[i],16),size=Number.parseInt(parts[i+1],16);
   for(const hit of current.hits)if(hit.at>=start&&hit.at<start+size)inlines.push({hit:hit.offset,depth,line,file,origin});}
  continue;
 }
 const [address,size,line,file]=text.split(' ');
 const start=Number.parseInt(address,16),length=Number.parseInt(size,16);
 for(const hit of current.hits)if(hit.at>=start&&hit.at<start+length)found.get(hit.offset)!.line=`${files.get(Number(file))??'?'}:${line}`;
}
if(id&&moduleId&&!moduleId.startsWith(id))console.error(`Warning: these symbols are module ${moduleId}, the crash was ${id}: wrong Electron version or platform.`);
const short=(file:string)=>file.replace(/^.*?\/out\/[^/]+\/(\.\.\/\.\.\/)?/,'');
for(const {offset} of wanted){
 const hit=found.get(offset);
 console.log(`${module}+0x${offset.toString(16)}  ${hit?`${hit.name}  ${short(hit.line)}`:'(not found)'}`);
 for(const inline of inlines.filter(row=>row.hit===offset).sort((a,b)=>a.depth-b.depth))console.log(`    inlined at ${short(files.get(inline.file)??'?')}:${inline.line}  ${origins.get(inline.origin)??'?'}`);
}
