import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {nativeImage} from 'electron';
import {APPLET_ART_LIMITS,artToPaint,codexArtTask,readAppletArt,readArtSubject,validArtApplet,type AppletArt,type AppletArtAttempt,type AppletArtSubject} from '../../../../../core/applets/index.ts';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../host/types.ts';
import {currentEnvironment,harnessEnvironment,locateLocalHarnesses,type LocalHarnessInstall} from '../agent-runtime/local-harness.ts';
import {stopChild} from '../agent-runtime/protocol.ts';

const ATTEMPTS='applet-art-attempts';
const DAY=86_400_000;

/** Pictures for the person's own Applets (core/applets/MY-APPLETS.md#pictures). The World page names the Applets it
 * placed that are the person's own; those with no pictures are painted one at a time by Codex's image generation on
 * this computer, with the person's own Codex sign-in or key. The icon (small) rides in the snapshot; the background
 * is read when its Applet opens. Without Codex, nothing is painted and the painted devices stay. */
export function installAppletArt(host:Host){
 const {store,page}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 let queue:AppletArtSubject[]=[],running:ChildProcess|null=null,busy=false,closed=false;
 // Pictures live with their Applet in the person's own Applets table (`my_applets`, by the ID without `app-`).
 const row=(applet:string)=>applet.slice(4);
 const art=(id:string)=>{try{const kept=store.ledger().myAppletArt(row(id));return kept?readAppletArt({applet:id,icon:kept.icon,background:kept.background,painter:'codex',madeAt:kept.paintedAt}):null;}catch(error){host.diagnostics.record(error,'appletArt');return null;}};
 const attempts=():AppletArtAttempt[]=>{try{return store.ledger().records(ATTEMPTS).flatMap(row=>typeof row.applet==='string'&&typeof row.failedAt==='number'?[row as AppletArtAttempt]:[]);}catch{return [];}};
 // Icons are small and every device wants its own, so they ride in the snapshot; the large backgrounds are read
 // only when their Applet opens.
 const icons=():Record<string,string>=>{
  if(!own())return {};
  try{return Object.fromEntries(Object.entries(store.ledger().myAppletIcons()).map(([id,icon])=>['app-'+id,icon]));}catch(error){host.diagnostics.record(error,'appletArt');return {};}
 };
 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>({...extras(),appletArt:icons()});

 const codex=():LocalHarnessInstall|null=>{try{return locateLocalHarnesses().find(h=>h.id==='codex'&&h.configured)??null;}catch{return null;}};
 const paintedToday=()=>attempts().filter(a=>(a as any).painted===true&&Date.now()-a.failedAt*1000<DAY).length;

 /** Codex makes both pictures in a folder of its own; they come back as small data URLs. */
 async function paint(subject:AppletArtSubject,install:LocalHarnessInstall):Promise<AppletArt> {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-art-')),started=Date.now();
  try{
   const environment=currentEnvironment();
   await new Promise<void>((resolve,reject)=>{
    const child=spawn(install.command,[...install.prefix,'exec','--skip-git-repo-check','--sandbox','workspace-write','-C',folder,'-'],{cwd:folder,env:harnessEnvironment(install,environment),stdio:['pipe','ignore','pipe'],windowsHide:true});
    running=child;let stderr='';
    const timer=setTimeout(()=>{stopChild(child);reject(new WorldletError('Painting took too long.'));},APPLET_ART_LIMITS.paintMs);
    child.stderr?.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString('utf8')).slice(-2000);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);running=null;code===0?resolve():reject(new WorldletError('Codex could not paint: '+(stderr.trim().split('\n').at(-1)||'exit '+code).slice(0,200)));});
    child.stdin?.on('error',()=>{});child.stdin?.end(codexArtTask(subject));
   });
   // Codex keeps every picture it makes in its own folder first; take them from there when the copy was dropped.
   const made=(name:string,square:boolean)=>{
    const file=path.join(folder,name);if(fs.existsSync(file))return nativeImage.createFromPath(file);
    const home=environment.env.CODEX_HOME||path.join(environment.home,'.codex'),root=path.join(home,'generated_images');
    const found:{file:string;at:number}[]=[];
    const walk=(dir:string,depth:number)=>{let entries:fs.Dirent[]=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
     for(const e of entries){const p=path.join(dir,e.name);if(e.isDirectory()&&depth<2)walk(p,depth+1);else if(/\.(png|jpe?g|webp)$/i.test(e.name)){const at=fs.statSync(p).mtimeMs;if(at>=started)found.push({file:p,at});}}};
    walk(root,0);
    for(const {file:candidate} of found.sort((a,b)=>b.at-a.at)){const image=nativeImage.createFromPath(candidate),{width,height}=image.getSize();if(width&&Math.abs(width-height)<width*.1===square)return image;}
    return null;
   };
   const icon=made('icon.png',true),background=made('background.png',false);
   if(!icon||icon.isEmpty()||!background||background.isEmpty())throw new WorldletError('Codex did not save the pictures.');
   const iconURL=icon.resize({width:APPLET_ART_LIMITS.iconSize,height:APPLET_ART_LIMITS.iconSize,quality:'best'}).toDataURL();
   const wide=background.resize({width:APPLET_ART_LIMITS.backgroundWidth,quality:'best'});
   let backgroundURL='';for(const quality of [82,70,58]){backgroundURL='data:image/jpeg;base64,'+wide.toJPEG(quality).toString('base64');if(backgroundURL.length<=APPLET_ART_LIMITS.background)break;}
   const record=readAppletArt({applet:subject.applet,icon:iconURL,background:backgroundURL,painter:'codex',madeAt:Math.floor(Date.now()/1000)});
   if(!record)throw new WorldletError('The pictures were too large to keep.');
   return record;
  }finally{try{fs.rmSync(folder,{recursive:true,force:true});}catch{}}
 }

 async function work(){
  if(busy||closed)return;busy=true;
  try{
   while(queue.length&&!closed&&own()){
    const install=codex();if(!install){queue=[];break;}
    const subject=queue.shift()!;
    if(art(subject.applet))continue;
    page.event('worldlet:applet-art',{applet:subject.applet,painting:true});
    try{
     const record=await paint(subject,install);
     // An Applet deleted while it was painted keeps no pictures.
     if(store.ledger().saveMyAppletArt(row(subject.applet),{icon:record.icon,background:record.background,paintedAt:record.madeAt})){
      store.ledger().put(ATTEMPTS,subject.applet,{id:subject.applet,applet:subject.applet,failedAt:record.madeAt,reason:'',painted:true});
      store.worldChanged();
     }
     page.event('worldlet:applet-art',{applet:subject.applet,painted:true});
    }catch(error){
     host.diagnostics.record(error,'appletArt');
     try{store.ledger().put(ATTEMPTS,subject.applet,{id:subject.applet,applet:subject.applet,failedAt:Math.floor(Date.now()/1000),reason:String((error as Error)?.message||error).slice(0,200)});}catch{}
     page.event('worldlet:applet-art',{applet:subject.applet,failed:true});
    }
   }
  }finally{busy=false;}
 }

 host.register({
  appletArt:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'';
   if(operation==='get'){
    const id=String(request.applet??'');if(!validArtApplet(id))throw new WorldletError('That is not one of your own Applets.');
    const kept=own()?art(id):null;
    return {art:kept?{icon:kept.icon,background:kept.background,madeAt:kept.madeAt}:null};
   }
   if(!own())return {ok:false,painter:null};
   // The World page names its person's own Applets; those with no pictures join the queue.
   if(operation==='ensure'||operation==='repaint'){
    const subjects=(Array.isArray(request.applets)?request.applets:[]).slice(0,100).map(readArtSubject).filter(Boolean) as AppletArtSubject[];
    if(!codex())return {ok:false,painter:null};
    if(operation==='repaint'){
     // The person asked for new pictures of one Applet: forget the old ones and paint it next.
     const subject=subjects[0];if(!subject)throw new WorldletError('That is not one of your own Applets.');
     store.ledger().saveMyAppletArt(row(subject.applet),null);store.ledger().delete(ATTEMPTS,subject.applet);store.worldChanged();
     queue=[subject,...queue.filter(s=>s.applet!==subject.applet)];void work();
     return {ok:true,painter:'codex',queued:[subject.applet]};
    }
    const all=attempts(),painted=new Set(Object.keys(icons()));
    const next=artToPaint(subjects.filter(s=>!queue.some(q=>q.applet===s.applet)),{painted,attempts:all.filter(a=>(a as any).painted!==true),paintedToday:paintedToday()+queue.length,now:Date.now()/1000});
    queue.push(...next);void work();
    return {ok:true,painter:'codex',queued:next.map(s=>s.applet)};
   }
   throw new WorldletError('Unknown request.');
  },
 });
 host.onQuit(()=>{closed=true;if(running)stopChild(running);});
}
