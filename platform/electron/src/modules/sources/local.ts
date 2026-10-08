import fs from 'node:fs';
import path from 'node:path';
import {clipboard,dialog,nativeImage,app} from 'electron';
import {core} from '../../core.ts';
import {readJSON,WorldletError} from '../../files.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
// Device-local actions: installed app launchers, the Obsidian vault reader, prototype copy
// and confirmed local deletion (Mac WorldView cases, ObsidianContent.swift).
const DEFAULT_LAUNCHERS:Record<string,string[]>={
 gmail:['com.apple.mail'],'google-calendar':['com.apple.iCal'],weather:['com.apple.weather'],
 'apple-notes':['com.apple.Notes'],'apple-reminders':['com.apple.reminders'],
 notion:['notion.id'],obsidian:['md.obsidian'],discord:['com.hnc.Discord'],codex:['com.openai.codex'],
 'voice-memos':['com.apple.VoiceMemos'],browser:['com.apple.Safari','com.google.Chrome']
};
// LaunchServices lookup, exactly what NSWorkspace answered on the Mac host.
const LOOKUP=String.raw`
ObjC.import('AppKit');
const ids=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile,$.NSUTF8StringEncoding)));
const found={};
for(const id of ids){const url=$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id);if(!url.isNil())found[id]=ObjC.unwrap(url.path);}
JSON.stringify(found);
`;
const mac=process.platform==='darwin';

export function createLocal(ctx:SourcesContext,clearMail:()=>void){
 const {store,host}=ctx;
 const launchers=():Row[]=>{const value=readJSON(path.join(host.profile.webRoot,'native-applet-launchers.json'));return Array.isArray(value)?value:[];};
 async function locate(ids:string[]):Promise<Record<string,string>> {
  const run=await ctx.run('/usr/bin/osascript',['-l','JavaScript','-e',LOOKUP],{input:JSON.stringify([...new Set(ids)]),timeout:20000});
  if(run.code!==0)throw new WorldletError('Installed apps could not be checked.');
  try{return JSON.parse(run.stdout);}catch{throw new WorldletError('Installed apps could not be checked.');}
 }
 async function icon(file:string){
  try{const image=await nativeImage.createThumbnailFromPath(file,{width:96,height:96});if(!image.isEmpty())return 'data:image/png;base64,'+image.toPNG().toString('base64');}catch{}
  try{const image=await app.getFileIcon(file,{size:process.platform==='darwin'?'normal':'large'});if(!image.isEmpty())return 'data:image/png;base64,'+image.resize({width:96,height:96}).toPNG().toString('base64');}catch{}
  return null;
 }
 async function erase(request:Row):Promise<Row> {
  const scope=core<Row>('localDeletionRequest',request);
  if(!await confirmed(scope.title,scope.detail,scope.button))return {cancelled:true};
  return {ok:true,removed:store.deleteLocalContent(request,clearMail)};
 }
 async function confirmed(title:string,detail:string,button:string){
  const options={type:'warning' as const,message:title,detail:mac?detail:detail.replace(/this Mac/g,'this computer'),buttons:[button,'Cancel'],defaultId:1,cancelId:1};
  const window=host.window();
  const result=window?await dialog.showMessageBox(window,options):await dialog.showMessageBox(options);
  return result.response===0;
 }

 // Obsidian: an explicitly selected, read-only local vault. No automatic filesystem scan.
 function readVault(vault:string,operation:string,id:string):Row {
  let root:string;
  try{root=fs.realpathSync(vault);fs.accessSync(root,fs.constants.R_OK);}catch{throw new WorldletError('This vault is unavailable. Choose it again with Fox.');}
  if(operation==='read'){
   const parts=id.split('/');
   if(!id||id.startsWith('/')||parts.includes('..'))throw new WorldletError('Invalid note path.');
   let file:string;try{file=fs.realpathSync(path.join(root,...parts));}catch{throw new WorldletError('This note is outside the selected vault.');}
   if(!file.startsWith(root+path.sep)||path.extname(file).toLowerCase()!=='.md'||parts.some(part=>part.startsWith('.')))throw new WorldletError('This note is outside the selected vault.');
   const stat=fs.statSync(file);
   if(!stat.isFile()||stat.size>1_048_576)throw new WorldletError('This note is too large for the reader. Open it in Obsidian.');
   return {title:path.basename(file,path.extname(file)),text:fs.readFileSync(file,'utf8'),path:id};
  }
  const pages:Row[]=[];let visited=0,limited=false;
  const walk=(dir:string):boolean=>{
   let entries:fs.Dirent[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{if(dir===root)throw new WorldletError('Could not read this vault.');return true;}
   for(const entry of entries){
    if(entry.name.startsWith('.'))continue;
    visited+=1;if(visited>10000||pages.length>=500){limited=true;return false;}
    const file=path.join(dir,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()){if(/\.(app|bundle|framework)$/i.test(entry.name))continue;if(!walk(file))return false;continue;}
    if(!entry.isFile()||path.extname(entry.name).toLowerCase()!=='.md')continue;
    const relative=path.relative(root,file).split(path.sep).join('/');
    let modified=0;try{modified=fs.statSync(file).mtimeMs/1000;}catch{}
    pages.push({id:relative,title:path.basename(entry.name,path.extname(entry.name)),list:relative,modified});
   }
   return true;
  };
  walk(root);
  pages.sort((a,b)=>b.modified-a.modified);
  return {connected:true,pages,scope:path.basename(vault)+' · Read only · '+(limited?'First 500 notes / 10,000 entries':`${pages.length} Markdown notes`)};
 }

 return {
  async installedApplets(body:Row={}):Promise<Row> {
   if(!mac)throw new WorldletError('Installed app detection is unavailable on this computer.');
   // Return only catalog matches, never paths, account data or a full application inventory.
   const candidates:Record<string,string[]>={...DEFAULT_LAUNCHERS};
   for(const launcher of launchers())if(typeof launcher?.key==='string'&&Array.isArray(launcher.bundleIds)&&launcher.bundleIds.length)candidates[launcher.key]=launcher.bundleIds.filter((id:unknown)=>typeof id==='string');
   const found=await locate(Object.values(candidates).flat());
   const keys=Object.keys(candidates).sort().filter(key=>candidates[key].some(id=>found[id]));
   const icons:Record<string,string>={};
   // An Area's recommendations need only the keys, not the icons setup shows.
   if(body?.icons===false)return {keys,icons};
   await Promise.all(keys.map(async key=>{const file=candidates[key].map(id=>found[id]).find(Boolean);const value=file?await icon(file):null;if(value)icons[key]=value;}));
   return {keys,icons};
  },
  async openInstalledApplet(body:Row):Promise<Row> {
   if(!mac)return {opened:false,reason:'not-installed'};
   const definition=launchers().find(launcher=>launcher?.key===body.key);
   const ids:string[]=Array.isArray(definition?.bundleIds)?definition.bundleIds.filter((id:unknown)=>typeof id==='string'):[];
   if(typeof body.key!=='string'||!ids.length)return {opened:false,reason:'not-installed'};
   const found=await locate(ids);
   const file=ids.map(id=>found[id]).find(Boolean);
   if(!file)return {opened:false,reason:'not-installed'};
   // Only publisher bundle identifiers from the shipped catalog may launch.
   const run=await ctx.run('/usr/bin/open',[file],{timeout:20000});
   if(run.code!==0)throw new WorldletError(run.stderr.trim()||'The app could not be opened.');
   return {opened:true};
  },
  async copyAppletPrototype(body:Row):Promise<Row> {
   if(!store.sampleEnabled()||typeof body.html!=='string'||Buffer.byteLength(body.html,'utf8')>=20000)throw new WorldletError('No practice prototype to copy.');
   await clipboard.writeText(body.html);
   if(await clipboard.readText()!==body.html)throw new WorldletError('Could not copy the prototype.');
   return {ok:true};
  },
  async obsidianContent(body:Row):Promise<Row> {
   const operation=typeof body.operation==='string'?body.operation:'list',id=typeof body.id==='string'?body.id:'';
   if(!store.writable||store.sampleEnabled())throw new WorldletError('Open your personal world to choose an Obsidian vault.');
   if(operation==='choose'){
    const window=host.window(),options={title:'Choose your Obsidian vault',buttonLabel:'Read this vault',properties:['openDirectory' as const]};
    const result=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);
    const folder=result.canceled?undefined:result.filePaths[0];
    if(!folder)return {connected:false,pages:[]};
    // Electron has no security-scoped bookmarks outside the Mac App Store: the grant is the path.
    store.state.connections=store.state.connections.filter((c:Row)=>c.provider!=='obsidian');
    store.state.connections.push({id:'obsidian-vault',provider:'obsidian',target:path.basename(folder),vaultPath:folder,transport:'native',syncStatus:'connected'});
    store.changed();
   }
   if(operation==='disconnect'){store.state.connections=store.state.connections.filter((c:Row)=>c.provider!=='obsidian');store.changed();return {connected:false,pages:[]};}
   if(!['choose','list','read'].includes(operation))throw new WorldletError('Unsupported vault operation.');
   const connection=store.state.connections.find((c:Row)=>c.provider==='obsidian');
   if(typeof connection?.vaultPath!=='string')return {connected:false,pages:[],scope:'Choose a Markdown vault with Fox.'};
   return readVault(connection.vaultPath,operation,id);
  },
  // Disconnecting stops the reading; these remove what was already read. Core words the dialog and scopes the deletion.
  async deleteSourceData(body:Row):Promise<Row> {return erase({action:'deleteSourceData',provider:body.provider});},
  deleteWorldItem(body:Row):Row {return {ok:true,removed:store.deleteLocalContent({action:'deleteWorldItem',id:body.id})>0};},
  async clearWorldContent():Promise<Row> {return erase({action:'clearWorldContent'});}
 };
}
