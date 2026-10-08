import {session} from 'electron';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';
import {cancelled,readLimited,TooLarge} from './io.ts';

const ORIGIN='https://worldlet.clockless.workers.dev';
const PATHS=['/api/auth/session','/api/auth/login','/api/chat','/api/transcribe','/api/transcribe/preview'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fixed first-party Fox endpoints. Requests never follow redirects, cookies live in the
 * app's own Chromium session, and the page never receives provider credentials. */
export class CompanionCloud {
 private tasks=new Map<string,AbortController>();
 cancel(id?:string){
  if(id===undefined){for(const controller of this.tasks.values())controller.abort();this.tasks.clear();}
  else this.tasks.get(id)?.abort();
 }
 async request(body:Row,onEvent?:(event:Row)=>Promise<void>):Promise<Row> {
  const route=body.path;
  if(typeof route!=='string'||!PATHS.includes(route))throw new WorldletError('Unsupported Fox endpoint.');
  const headers:Record<string,string>={Origin:ORIGIN,'Cache-Control':'no-store'};
  const init:RequestInit={method:'GET',headers,redirect:'error',cache:'no-store',credentials:'include'};
  if(route.startsWith('/api/transcribe')){
   const encoded=body.audio;
   if(typeof encoded!=='string'||encoded.length>11_200_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length%4!==0)throw new WorldletError('Invalid voice recording.');
   const audio=Buffer.from(encoded,'base64');
   if(audio.length<128||audio.length>8_388_608)throw new WorldletError('Invalid voice recording.');
   init.method='POST';init.body=audio;headers['Content-Type']='audio/wav';
  }else if(route!=='/api/auth/session'){
   if(!body.body||typeof body.body!=='object'||Array.isArray(body.body))throw new WorldletError('Invalid Fox request.');
   const data=JSON.stringify(body.body);
   if(Buffer.byteLength(data)>200_000)throw new WorldletError('This message is too large.');
   init.method='POST';init.body=data;headers['Content-Type']='application/json';
  }
  const streaming=route==='/api/chat'&&!!onEvent&&body.body?.stream===true;
  const id=typeof body.streamId==='string'?body.streamId:null;
  if(id!==null&&(!UUID.test(id)||this.tasks.size>=2||this.tasks.has(id)))throw new WorldletError('Invalid stream request.');
  const controller=new AbortController();
  if(id!==null)this.tasks.set(id,controller);
  // Like the native 60-second request timeout: it restarts whenever bytes arrive.
  let idle:NodeJS.Timeout|null=null;
  const touch=()=>{if(idle)clearTimeout(idle);idle=setTimeout(()=>controller.abort(new WorldletError('Fox could not connect. Please try again.')),60_000);};
  try{
   touch();
   let response:Response;
   try{response=await session.fromPartition('persist:companion-cloud').fetch(ORIGIN+route,{...init,signal:controller.signal});}
   catch(error){if(controller.signal.aborted&&!(controller.signal.reason instanceof WorldletError))throw cancelled();throw new WorldletError('Fox could not connect. Please try again.');}
   if(streaming&&onEvent){
    const kind=response.headers.get('content-type')??'';
    await onEvent({type:'headers',status:response.status,streaming:kind.includes('application/x-ndjson')});
    if(!response.body)return {status:response.status,stream:true};
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let pending='',count=0;
    const emit=async(line:string)=>{
     if(controller.signal.aborted)throw cancelled();
     count+=Buffer.byteLength(line);
     if(count>1_000_000)throw new WorldletError('Fox reply is too large.');
     if(line)await onEvent({type:'line',line});
    };
    for(;;){
     let chunk:ReadableStreamReadResult<Uint8Array>;
     try{chunk=await reader.read();}catch{if(controller.signal.aborted&&!(controller.signal.reason instanceof WorldletError))throw cancelled();throw new WorldletError('Fox could not connect. Please try again.');}
     if(chunk.done)break;
     touch();
     pending+=decoder.decode(chunk.value,{stream:true});
     const lines=pending.split(/\r?\n/);pending=lines.pop()??'';
     for(const line of lines)await emit(line);
     if(pending.length>1_000_000)throw new WorldletError('Fox reply is too large.');
    }
    pending+=decoder.decode();
    if(pending)await emit(pending);
    return {status:response.status,stream:true};
   }
   let data:Buffer;
   try{data=await readLimited(response,1_000_000);}
   catch(error){if(error instanceof TooLarge)throw new WorldletError('Invalid Fox response.');if(controller.signal.aborted&&!(controller.signal.reason instanceof WorldletError))throw cancelled();throw new WorldletError('Fox could not connect. Please try again.');}
   let value:unknown;
   try{value=JSON.parse(data.toString('utf8'));}catch{value={error:'Fox could not connect. Please try again.'};}
   return {status:response.status,body:value};
  }finally{
   if(idle)clearTimeout(idle);
   if(id!==null&&this.tasks.get(id)===controller)this.tasks.delete(id);
  }
 }
}
