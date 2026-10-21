import {app,shell} from 'electron';
import {execFile,spawn} from 'node:child_process';
import path from 'node:path';
import {defaultBrowserSupported,incomingLink,linksInArguments,type DefaultBrowserStatus} from '../../../../agent/app/index.ts';
import {WorldletError} from '../../files.ts';
import {macAppBundle} from './app-bundle.ts';
import {handOffLinks,receiveLinks} from '../../system-browser.ts';
import type {Host} from '../../types.ts';

/** Per computer, never part of a World backup: the browser that was the default when the setting was turned on. */
const PREVIOUS='worldlet.defaultBrowser.previous';
/** Windows only: Worldlet registered itself as a browser, so each launch keeps the registered path current. */
const REGISTERED='worldlet.defaultBrowser.registered';
const PROG_ID='WorldletURL',CLIENT='Software\\Clients\\StartMenuInternet\\Worldlet';

const run=(file:string,args:string[])=>new Promise<string>((resolve,reject)=>execFile(file,args,{windowsHide:true,encoding:'utf8'},(error,stdout)=>error?reject(error):resolve(stdout)));

/** Worldlet as the default browser, off until a person turns it on in Settings → General. The Mac asks the person
 * to confirm the change itself; Windows lets only the person choose, in Settings → Default apps, so Worldlet
 * registers as a browser and opens that page. Links that arrive go to the World, which opens each in its own
 * website Thing or the Browser; pages Worldlet sends to "your browser" go to the previous default meanwhile. */
export function createDefaultBrowser(host:Host){
 const supported=()=>defaultBrowserSupported({channel:host.profile.channel,platform:process.platform,windowsStore:!!process.windowsStore});
 // The Mac reports the app bundle; Windows the executable.
 const own=process.platform==='darwin'?macAppBundle(process.execPath):process.execPath;
 const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
 const handler=async()=>{try{return (await app.getApplicationInfoForProtocol('https://example.com/'))?.path||'';}catch{return '';}};
 const read=async():Promise<DefaultBrowserStatus>=>{
  if(!supported())return 'unsupported';
  if(process.platform==='darwin')return app.isDefaultProtocolClient('https')?'on':'off';
  const found=await handler();return found&&same(found,own)?'on':'off';
 };
 // Read once and again when a person may have changed it (the setting, a system prompt, System Settings).
 let current:DefaultBrowserStatus|null=null;
 const status=async()=>current??=await read();
 const snapshot=async()=>({status:await status(),platform:process.platform});

 const windowsKeys=[['HKCU\\Software\\Classes\\'+PROG_ID],['HKCU\\'+CLIENT]];
 const registerWindows=async()=>{
  const icon=`"${process.execPath}",0`;
  for(const [key,name,value] of [
   ['HKCU\\Software\\Classes\\'+PROG_ID,'','Worldlet web page'],
   ['HKCU\\Software\\Classes\\'+PROG_ID+'\\DefaultIcon','',icon],
   ['HKCU\\Software\\Classes\\'+PROG_ID+'\\shell\\open\\command','',`"${process.execPath}" "%1"`],
   ['HKCU\\'+CLIENT,'','Worldlet'],
   ['HKCU\\'+CLIENT+'\\DefaultIcon','',icon],
   ['HKCU\\'+CLIENT+'\\shell\\open\\command','',`"${process.execPath}"`],
   ['HKCU\\'+CLIENT+'\\Capabilities','ApplicationName','Worldlet'],
   ['HKCU\\'+CLIENT+'\\Capabilities','ApplicationDescription','Your personal AI world'],
   ['HKCU\\'+CLIENT+'\\Capabilities','ApplicationIcon',icon],
   ['HKCU\\'+CLIENT+'\\Capabilities\\URLAssociations','http',PROG_ID],
   ['HKCU\\'+CLIENT+'\\Capabilities\\URLAssociations','https',PROG_ID],
   ['HKCU\\'+CLIENT+'\\Capabilities\\StartMenu','StartMenuInternet','Worldlet'],
   ['HKCU\\Software\\RegisteredApplications','Worldlet',CLIENT+'\\Capabilities']
  ])await run('reg',['add',key,...(name?['/v',name]:['/ve']),'/d',value,'/f']);
  host.preferences.set(REGISTERED,true);
 };
 const unregisterWindows=async()=>{
  for(const [key] of windowsKeys)await run('reg',['delete',key,'/f']).catch(()=>{});
  await run('reg',['delete','HKCU\\Software\\RegisteredApplications','/v','Worldlet','/f']).catch(()=>{});
  host.preferences.remove(REGISTERED);
 };
 // The installed path can move with an update; a registration that points at it follows.
 if(supported()&&process.platform==='win32'&&host.preferences.bool(REGISTERED))void registerWindows().catch(error=>host.diagnostics.record(error,'defaultBrowser'));

 /** The previous default browser, or the system's own when none was recorded: never Worldlet again. */
 const openPrevious=async(url:string)=>{
  const previous=host.preferences.string(PREVIOUS);
  if(process.platform==='darwin'){await run('/usr/bin/open',previous?['-a',previous,url]:['-b','com.apple.Safari',url]);return true;}
  if(process.platform==='win32'){
   if(previous){spawn(previous,[url],{detached:true,stdio:'ignore'}).unref();return true;}
   await shell.openExternal('microsoft-edge:'+url);return true;
  }
  return false;
 };
 handOffLinks(async url=>await status()==='on'&&openPrevious(url));

 // Links wait here until the World takes them: it may still be loading, or onboarding may not be finished.
 const queue:string[]=[];
 const bring=()=>{const window=host.window();if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();};
 const arrive=(value:string)=>{
  const link=incomingLink(value);if(!link)return;
  if(link.to==='previous'){void openPrevious(link.url).catch(error=>host.diagnostics.record(error,'defaultBrowser'));return;}
  queue.push(link.url);bring();host.page.event('worldlet:incoming-links');
 };
 receiveLinks(arrive);
 for(const url of linksInArguments(process.argv))arrive(url);
 app.on('second-instance',(_event,argv)=>{for(const url of linksInArguments(argv))arrive(url);});

 return {
  supported,snapshot,
  /** Re-read the system; tells the World when the status moved. */
  async refresh(){const before=current;current=null;if(await status()!==before&&before!==null)host.page.event('worldlet:default-browser');return snapshot();},
  take:()=>({links:queue.splice(0)}),
  async set(enabled:boolean){
   if(!supported())throw new WorldletError('Using Worldlet as your default browser is available only in the installed Worldlet app.');
   if(enabled){
    const before=await handler();
    if(before&&!same(before,own))host.preferences.set(PREVIOUS,before);
    if(process.platform==='darwin'){app.setAsDefaultProtocolClient('http');app.setAsDefaultProtocolClient('https');}
    else{await registerWindows();await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Worldlet');}
   }else if(process.platform==='darwin'){
    // Back to the browser it replaced; the Mac asks the person to confirm this change too.
    const previous=host.preferences.string(PREVIOUS);
    const bundle=previous?(await run('/usr/bin/defaults',['read',path.join(previous,'Contents','Info'),'CFBundleIdentifier']).catch(()=>'')).trim():'';
    const script=`ObjC.import('CoreServices');for(const scheme of ['http','https'])$.LSSetDefaultHandlerForURLScheme($(scheme),$(${JSON.stringify(bundle)}))`;
    if(!bundle||!await run('/usr/bin/osascript',['-l','JavaScript','-e',script]).then(()=>true,()=>false)){app.removeAsDefaultProtocolClient('http');app.removeAsDefaultProtocolClient('https');}
   }else{
    await unregisterWindows();await shell.openExternal('ms-settings:defaultapps');
   }
   current=null;
   return snapshot();
  }
 };
}
