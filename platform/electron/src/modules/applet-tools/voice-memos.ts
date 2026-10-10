import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {app,dialog,shell} from 'electron';
import {WorldletError} from '../../files.ts';
import {relaunchAfterQuit} from '../../host/quit.ts';
import type {Host,Row} from '../../host/types.ts';
import {SurfaceAudio} from '../world-audio/audio.ts';
import type {MediaSurface} from '../media/surface.ts';
import {cancelled} from '../media/io.ts';

const EXTENSIONS=new Set(['m4a','mp3','wav','aac','caf','aif','aiff']);
const extension=(file:string)=>path.extname(file).slice(1).toLowerCase();
const RETRY='worldlet.voiceMemos.retryAfterRestart';

/** User-selected recordings only. Export folder fallback; the library adapter is separately opt-in. */
const VoiceMemoFiles={
 file(root:string,id:string){
  if(!id||id.startsWith('/')||path.isAbsolute(id)||id.split(/[\\/]/).some(part=>part==='..'||part.startsWith('.')))throw new WorldletError('Invalid recording.');
  let base:string,file:string;
  try{base=fs.realpathSync(root);file=fs.realpathSync(path.join(base,id));}catch{throw new WorldletError('This recording is outside the selected folder.');}
  if(!file.startsWith(base+path.sep)||!EXTENSIONS.has(extension(file)))throw new WorldletError('This recording is outside the selected folder.');
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size>512_000_000)throw new WorldletError('Choose a recording smaller than 512 MB.');
  return file;
 },
 list(root:string):Row {
  let base:string;
  try{base=fs.realpathSync(root);fs.accessSync(base,fs.constants.R_OK);}catch{throw new WorldletError('The recordings folder is unavailable. Choose it again with Fox.');}
  const pages:Row[]=[];let visited=0,limited=false;
  const walk=(dir:string)=>{
   let entries:fs.Dirent[];
   try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
   for(const entry of entries){
    if(limited)return;
    visited+=1;
    if(visited>10000||pages.length>=200){limited=true;return;}
    if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){if(!/\.(app|bundle|pkg)$/i.test(entry.name))walk(full);continue;}
    if(!entry.isFile()||!EXTENSIONS.has(extension(entry.name)))continue;
    const id=path.relative(base,full).split(path.sep).join('/');
    try{VoiceMemoFiles.file(base,id);}catch{continue;}
    pages.push({id,title:path.basename(entry.name,path.extname(entry.name)),list:extension(entry.name).toUpperCase()+' · Local recording',modified:fs.statSync(full).mtimeMs/1000});
   }
  };
  walk(base);
  pages.sort((a,b)=>b.modified-a.modified);
  return {connected:true,pages,scope:'Selected folder · Read only · '+(limited?'First 200 recordings / 10,000 entries':`${pages.length} recordings`)};
 },
 transcript(file:string,root:string){
  const text=file.slice(0,-path.extname(file).length)+'.txt';
  try{
   const real=fs.realpathSync(text),base=fs.realpathSync(root);
   if(!real.startsWith(base+path.sep))return '';
   const stat=fs.statSync(real);
   if(!stat.isFile()||stat.size>128000)return '';
   return fs.readFileSync(real,'utf8');
  }catch{return '';}
 }
};

/** Compatibility adapter for Apple's undocumented local store. Never writes to it. */
export const VoiceMemoLibrary={
 get root(){return path.join(os.homedir(),'Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings');},
 list(folder=VoiceMemoLibrary.root):Row {
  const database=path.join(folder,'CloudRecordings.db');
  // Probe the actual file: existence checks also fail when privacy controls deny access.
  try{fs.closeSync(fs.openSync(database,'r'));}
  catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')throw new WorldletError('The local Voice Memos library was not found. Open Apple Voice Memos on this Mac and download a recording, then retry. Full Disk Access does not download iCloud recordings.');
   throw new WorldletError(`This copy of ${app.getName()} cannot read the Voice Memos library. In Full Disk Access, check this exact app at ${appBundle()}, then quit and reopen it. Other Worldlet builds have separate permissions.`);
  }
  let db:DatabaseSync;
  try{db=new DatabaseSync(database,{readOnly:true,timeout:1000} as any);}
  catch{throw new WorldletError('The Voice Memos database could not be opened, although its file is readable. Close Voice Memos and retry; its library format may have changed.');}
  try{
   let columns:Set<string>;
   try{columns=new Set((db.prepare('PRAGMA table_info(ZCLOUDRECORDING)').all() as Row[]).map(row=>String(row.name).toUpperCase()));}
   catch{throw new WorldletError('Voice Memos library format is unavailable.');}
   if(!columns.has('ZPATH')||!columns.has('ZDATE'))throw new WorldletError('This Voice Memos library format is not supported yet.');
   const titles=['ZCUSTOMLABELFORSORTING','ZENCRYPTEDTITLE','ZCUSTOMLABEL'].filter(c=>columns.has(c)).map(c=>`NULLIF(${c}, '')`);
   const title=titles.length?'COALESCE('+[...titles,"'Recording'"].join(',')+')':"'Recording'";
   const filter=columns.has('ZMARKEDFORDELETION')?' WHERE COALESCE(ZMARKEDFORDELETION,0)=0':'';
   let rows:Row[];
   try{rows=db.prepare(`SELECT ZPATH AS path, ${title} AS title, ZDATE AS date FROM ZCLOUDRECORDING${filter} ORDER BY ZDATE DESC LIMIT 200`).all() as Row[];}
   catch(error){throw new WorldletError(/busy|locked/i.test(String((error as Error).message))?'Voice Memos is busy. Please retry.':'Could not read the Voice Memos library. Try again after closing Voice Memos.');}
   const pages:Row[]=[];
   for(const row of rows){
    if(typeof row.path!=='string')continue;
    // Resolve only safe library-relative paths, never arbitrary database URLs.
    try{VoiceMemoFiles.file(folder,row.path);}catch{continue;}
    const date=new Date((Number(row.date)+978307200)*1000);
    pages.push({id:row.path,title:typeof row.title==='string'?row.title:'Recording',list:date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}),modified:date.getTime()/1000});
   }
   return {connected:true,pages,scope:'Voice Memos · Downloaded recordings · Read only'};
  }finally{db.close();}
 },
 /** Walk bounded ISO media boxes, skipping audio payloads rather than scanning audio bytes. */
 transcript(file:string){
  const fd=fs.openSync(file,'r');
  try{
   const end=fs.fstatSync(fd).size;
   const read=(offset:number,length:number)=>{const buffer=Buffer.alloc(length);const count=fs.readSync(fd,buffer,0,length,offset);return buffer.subarray(0,count);};
   const walk=(start:number,limit:number,depth:number):string=>{
    if(depth>=8)return '';
    let offset=start,count=0;
    while(offset+8<=limit&&count<10000){
     count+=1;
     const header=read(offset,8);if(header.length!==8)break;
     let size=header.readUInt32BE(0),headerSize=8;
     const kind=header.subarray(4,8).toString('latin1');
     if(size===1){const extra=read(offset+8,8);if(extra.length!==8)break;size=Number(extra.readBigUInt64BE(0));headerSize=16;}
     if(size===0)size=limit-offset;
     if(size<headerSize||size>limit-offset)break;
     if(kind==='tsrp'&&size-headerSize<=2_000_000){
      try{
       const json=JSON.parse(read(offset+headerSize,size-headerSize).toString('utf8'));
       const runs=json?.attributedString?.runs;
       if(Array.isArray(runs))return runs.filter((_:unknown,index:number)=>index%2===0).filter((v:unknown)=>typeof v==='string').join('');
      }catch{}
     }
     if(['moov','trak','udta','mdia'].includes(kind)){const text=walk(offset+headerSize,offset+size,depth+1);if(text)return text;}
     offset+=size;
    }
    return '';
   };
   return walk(0,end,0);
  }finally{fs.closeSync(fd);}
 }
};
/** The bundle the user grants Full Disk Access to (Electron.app in development). */
function appBundle(){const match=/^(.*?\.app)(?:\/|$)/.exec(process.execPath);return match?match[1]:process.execPath;}

/** Voice Memos (Mac only): read-only listing and playback through the media surface. */
export class VoiceMemos {
 private host:Host;
 private audio:SurfaceAudio;
 private selected='';
 private revision=0;
 private failed=false;
 constructor(host:Host,surface:MediaSurface){
  this.host=host;this.audio=new SurfaceAudio(surface,'memo');
  this.audio.onMedia=event=>{if(event.event==='error')this.failed=true;};
 }
 stop(){this.revision+=1;this.audio.unload();this.selected='';this.failed=false;}
 private snapshot():Row {
  const duration=this.audio.duration;
  return {id:this.selected,playing:this.audio.loaded&&!this.audio.paused,position:this.audio.loaded?this.audio.time:0,duration:duration!==null&&Number.isFinite(duration)?duration:0,error:this.failed?'This audio could not be played. Export it as M4A from Voice Memos and retry.':''};
 }
 private async refresh(){const info=await this.audio.info().catch(()=>null);if(info&&info.token===this.audio.token){this.audio.time=info.time;this.audio.duration=info.duration;this.audio.paused=info.paused;if(info.error)this.failed=true;}}
 async handle(body:Row):Promise<Row> {
  const {store,preferences}=this.host;
  let operation=typeof body.operation==='string'?body.operation:'list';
  // Cleanup works after disconnect or a switch to the practice world.
  if(operation==='stop'){this.stop();return this.snapshot();}
  if(process.platform!=='darwin')throw new WorldletError('Voice Memos is available in Worldlet for Mac.');
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Use your personal Mac world to access recordings.');
  if(!['connect','permissions','restart','choose','list','select','play','pause','seek','status','disconnect'].includes(operation))throw new WorldletError('Unknown recording operation.');
  if(operation==='list'&&preferences.bool(RETRY)){preferences.remove(RETRY);operation='connect';}
  if(operation==='restart'){
   preferences.set(RETRY,true);
   relaunchAfterQuit();
   setTimeout(()=>app.quit(),50);
   return {restarting:true};
  }
  if(operation==='permissions'){
   shell.showItemInFolder(appBundle());
   void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
   return {awaitingPermission:true,appName:app.getName()};
  }
  const connections=():Row[]=>store.state.connections;
  if(operation==='connect'){
   const result=VoiceMemoLibrary.list();
   this.stop();
   store.state.connections=connections().filter(c=>c.provider!=='voice-memos');
   store.state.connections.push({id:'voice-memos-library',provider:'voice-memos',target:'Apple Voice Memos',transport:'native',syncStatus:'connected'});
   store.changed();
   return result;
  }
  if(operation==='choose'){
   const window=this.host.window();
   const options={title:'Choose a Voice Memos export folder',message:'Export recordings from Voice Memos into a folder, then choose that folder. Worldlet reads audio and optional matching .txt transcripts without changing them.',buttonLabel:'Read recordings',properties:['openDirectory' as const]};
   const picked=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);
   if(picked.canceled||!picked.filePaths[0])return {cancelled:true};
   const folder=picked.filePaths[0];
   this.stop();
   store.state.connections=connections().filter(c=>c.provider!=='voice-memos');
   // Electron reads the folder by path; a Mac security-scoped bookmark cannot be resolved here.
   store.state.connections.push({id:'voice-memos-folder',provider:'voice-memos',target:path.basename(folder),folder,transport:'native',syncStatus:'connected'});
   store.changed();
  }
  if(operation==='disconnect'){this.stop();store.state.connections=connections().filter(c=>c.provider!=='voice-memos');store.changed();return {connected:false,pages:[]};}
  const connection=connections().find(c=>c.provider==='voice-memos');
  if(operation==='list'&&!connection)return {connected:false,pages:[]};
  if(!connection)throw new WorldletError('Choose your recordings folder with Fox first.');
  const library=connection.id==='voice-memos-library';
  let root:string;
  if(library)root=VoiceMemoLibrary.root;
  else if(typeof connection.folder==='string'&&path.isAbsolute(connection.folder))root=connection.folder;
  else throw new WorldletError('Reconnect Voice Memos with Fox.');
  if(operation==='list'||operation==='choose')return library?VoiceMemoLibrary.list(root):VoiceMemoFiles.list(root);
  if(operation==='status'){if(this.audio.loaded)await this.refresh();return this.snapshot();}
  const id=typeof body.id==='string'?body.id:'';
  if(operation==='select'){
   this.stop();const request=this.revision;
   try{
    const file=VoiceMemoFiles.file(root,id);
    await this.audio.load(pathToFileURL(file).href,false);
    const info=await this.audio.metadata(20_000);
    if(request!==this.revision)throw cancelled();
    const duration=info?.duration;
    if(!info||info.error||typeof duration!=='number'||!Number.isFinite(duration)||duration<=0)throw new WorldletError('This file has no playable audio. Export it from Voice Memos as M4A.');
    this.audio.duration=duration;this.audio.setVolume(1);
    let text='';
    if(library){try{text=VoiceMemoLibrary.transcript(file);}catch{}}
    else text=VoiceMemoFiles.transcript(file,root);
    this.selected=id;
    return {id,title:path.basename(file,path.extname(file)),duration,position:0,playing:false,transcript:text,transcriptSource:text?(library?'Apple Voice Memos transcript':'Matching local .txt file'):''};
   }catch(error){if(request===this.revision)this.stop();throw error;}
  }
  if(id!==this.selected||!id||!this.audio.loaded)throw new WorldletError('Choose a recording first.');
  if(operation==='play'){
   const end=this.audio.duration;
   await this.refresh();
   if(end!==null&&Number.isFinite(end)&&this.audio.time>=end-0.1)await this.audio.seek(0);
   if(id!==this.selected)throw cancelled();
   try{await this.audio.play();}catch{this.failed=true;}
  }
  if(operation==='pause')this.audio.pause();
  if(operation==='seek'){
   const position=body.position;
   if(typeof position!=='number'||!Number.isFinite(position))throw new WorldletError('Invalid playback position.');
   const duration=this.audio.duration;
   if(duration===null||!Number.isFinite(duration)||duration<=0)throw new WorldletError('This recording is still loading.');
   await this.audio.seek(Math.max(0,Math.min(position,duration)));
  }
  await this.refresh();
  return this.snapshot();
 }
}
