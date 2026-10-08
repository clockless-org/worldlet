/** Native crashes of the installed app (core/diagnostics/ANALYTICS.md#native-crashes): the crashed process, the
 * exception and the crashed thread as module + offset frames, nothing else. Offsets into Electron's own modules are
 * symbolicated later against Electron's published symbols (`npm run crash:symbols`); a device never holds them. */
const MAX_FRAMES=40;
/** Modules Worldlet ships: their frames are the app's own; system libraries are not. */
const APP_MODULE=/^(Electron Framework|Worldlet( Helper.*)?|Worldlet\.exe|electron\.exe|libffmpeg\.dylib|ffmpeg\.dll|libEGL\.dll|libGLESv2\.dll|vk_swiftshader\.dll|[\w-]+\.node)$/;
/** The processes of the Mac app (bundle names) and the Windows exe; anything else is `other`. */
const PROCESSES=['Worldlet','Worldlet Helper','Worldlet Helper (Renderer)','Worldlet Helper (GPU)','Worldlet Helper (Plugin)','Worldlet.exe'];
/** Windows exception codes worth naming; Chromium's CHECK and __fastfail end in STACK_BUFFER_OVERRUN. */
const WINDOWS_CODES:Record<string,string>={c0000005:'EXCEPTION_ACCESS_VIOLATION',80000003:'EXCEPTION_BREAKPOINT',c0000409:'EXCEPTION_STACK_BUFFER_OVERRUN',
 c000001d:'EXCEPTION_ILLEGAL_INSTRUCTION',c00000fd:'EXCEPTION_STACK_OVERFLOW',e0000008:'OUT_OF_MEMORY',c0000374:'EXCEPTION_HEAP_CORRUPTION',c0000420:'EXCEPTION_ASSERTION_FAILURE'};
const moduleName=(value:unknown)=>typeof value==='string'&&/^[\w .()+-]{1,80}$/.test(value)&&!/^\.|\.\./.test(value)?value:'other';
const symbol=(value:unknown)=>typeof value==='string'&&/^[A-Za-z_][\w:$.~]{0,100}$/.test(value)?value:'';

/** A crash as the platform parsed it → the frames PostHog groups by and the few facts a fix needs. Frames run oldest
 * first, as error tracking expects. A system library may keep the symbol the OS gave; an app module never does,
 * because its exports are not where the crash is (3149: `ares_llist_node_next + 48115252` was IconLoader::ReadIcon). */
export function nativeCrashReport(value:any){
 const raw=Array.isArray(value?.frames)?value.frames.slice(0,MAX_FRAMES):[];
 const frames=raw.map((frame:any)=>{
  const module=moduleName(frame?.module),offset=Number(frame?.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset>2**40)return null;
  const app=APP_MODULE.test(module),own=app?'':symbol(frame?.symbol);
  return {platform:'node:javascript',filename:module,function:own||`${module}+0x${offset.toString(16)}`,lineno:0,colno:0,in_app:app};
 }).filter(Boolean).reverse();
 const code=typeof value?.code==='string'?value.code.toLowerCase().replace(/^0x/,''):'';
 const type=typeof value?.exception==='string'&&/^(EXC|SIG|EXCEPTION)_[A-Z_]{2,40}$/.test(value.exception)?value.exception:WINDOWS_CODES[code]??(/^[0-9a-f]{8}$/.test(code)?'0x'+code:'NativeCrash');
 const signal=typeof value?.signal==='string'&&/^SIG[A-Z]{2,8}$/.test(value.signal)?value.signal:'';
 const build=typeof value?.build==='string'&&/^\d{4}\.\d{4}\.\d{1,6}$/.test(value.build)?value.build:'';
 const top=[...frames].reverse()[0];
 return {type,signal,program:PROCESSES.includes(value?.program)?value.program:'other',build,
  arch:['arm64','x86_64','x64'].includes(value?.arch)?value.arch:'',moduleId:typeof value?.moduleId==='string'&&/^[0-9A-Fa-f-]{32,41}$/.test(value.moduleId)?value.moduleId.toUpperCase():'',
  module:top?.filename??'',frames};
}

/** A macOS crash report (.ips, bug_type 309) of one of Worldlet's processes → the raw crash nativeCrashReport takes.
 * Not ours, not a crash, or unreadable → null. Only the crashed thread is read. */
export function nativeCrashFromIps(text:string){
 if(typeof text!=='string')return null;
 const split=text.indexOf('\n');
 let header:any,body:any;
 try{header=JSON.parse(text.slice(0,split));body=JSON.parse(text.slice(split+1));}catch{return null;}
 const name=typeof header?.app_name==='string'?header.app_name:body?.procName;
 if(header?.bug_type!=='309'||!(name==='Worldlet'||/^Worldlet Helper/.test(name??'')))return null;
 if(body?.bundleInfo?.CFBundleIdentifier&&!/^app\.worldlet\.mac/.test(body.bundleInfo.CFBundleIdentifier))return null;
 const thread=Array.isArray(body?.threads)?body.threads[Number(body.faultingThread)]:null,images=Array.isArray(body?.usedImages)?body.usedImages:[];
 const frames=(Array.isArray(thread?.frames)?thread.frames:[]).map((frame:any)=>{
  const image=images[frame?.imageIndex];
  return {module:image?.name,offset:frame?.imageOffset,symbol:frame?.symbol};
 });
 const top=images[thread?.frames?.[0]?.imageIndex];
 return {program:body?.procName,exception:body?.exception?.type,signal:body?.exception?.signal,
  build:typeof header?.app_version==='string'?header.app_version:'',arch:top?.arch??images[0]?.arch,moduleId:top?.uuid,frames};
}
