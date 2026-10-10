import fs from 'node:fs';
import path from 'node:path';
import {protocol,net,type Session} from 'electron';
import {pathToFileURL} from 'node:url';
export const WORLD_SCHEME='worldlet';
export const WORLD_ORIGIN='worldlet://app';
export const WORLD_URL=WORLD_ORIGIN+'/index.html';
/** Must run before `app.ready`. */
export function registerWorldScheme(){
 protocol.registerSchemesAsPrivileged([{scheme:WORLD_SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,codeCache:true,stream:true}}]);
}
/** Only the packaged main World document is trusted: no query, no other path, no subframe. */
export function trustedWorldURL(value:string){
 // Node reports origin "null" for custom schemes, so compare scheme and host directly.
 try{const url=new URL(value);return url.protocol===WORLD_SCHEME+':'&&url.host==='app'&&url.pathname==='/index.html'&&!url.search&&!url.username&&!url.password;}catch{return false;}
}
/** Serves files from the packaged UI root after resolving links; nothing outside it is reachable. `ingest` answers
 * /ingest/… (the page's product analytics, forwarded by the host: modules/shell/analytics.ts). */
export function serveWorld(session:Session,webRoot:()=>string,ingest?:(request:Request)=>Promise<Response>){
 // The root resolves once per configured path, not on every request.
 let resolved:{from:string,root:string}|null=null;
 const realRoot=()=>{const from=webRoot();if(resolved?.from!==from)resolved={from,root:fs.realpathSync(from)};return resolved.root;};
 session.protocol.handle(WORLD_SCHEME,async request=>{
  const url=new URL(request.url);
  if(url.host!=='app')return new Response('Not found',{status:404});
  if(url.pathname==='/ingest'||url.pathname.startsWith('/ingest/'))return ingest?ingest(request):new Response(null,{status:204});
  const root=realRoot();
  let relative=decodeURIComponent(url.pathname);
  if(relative==='/'||!relative)relative='/index.html';
  let file:string;
  try{file=await fs.promises.realpath(path.join(root,path.normalize(relative)));}catch{return new Response('Not found',{status:404});}
  if(file!==root&&!file.startsWith(root+path.sep)||!(await fs.promises.stat(file)).isFile())return new Response('Not found',{status:404});
  const response=await net.fetch(pathToFileURL(file).toString());
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','no-cache');
  return new Response(response.body,{status:response.status,headers});
 });
}
