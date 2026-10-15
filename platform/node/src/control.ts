// The Node host's control socket and the `worldlet` command line (platform/node/README.md#the-worldlet-command): the
// running host listens on an owner-only unix socket in its library, and `node worldlet.cjs <command>` asks it one
// question and prints the answer. The answer goes only to the asker's stdout: the host never logs it, so the browser
// link, which carries its secret, never reaches a service's journal. Node built-ins and the QR code only, so the command
// line starts without loading the host (cli.ts).
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {terminalQr} from './qr.ts';

/** The socket in the library; on Windows a named pipe, named after the library. */
export const CONTROL_SOCKET='control.sock';
export const controlSocketPath=(root:string)=>process.platform==='win32'?`\\\\.\\pipe\\worldlet-${crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16)}`:path.join(root,CONTROL_SOCKET);
export const CONTROL_COMMANDS=['setup','link','status','register'] as const;
export type ControlCommand=typeof CONTROL_COMMANDS[number];
export type ControlRequest={command:ControlCommand;agent?:string};
/** An answer: `lines` for the asker's stdout, or `error`. */
export type ControlReply={lines:string[]}|{error:string};
export const NOT_RUNNING='Worldlet is not running on this computer: start the Worldlet service, then try again.';
const LIMIT=64*1024;

export function readControlRequest(value:unknown):ControlRequest|null {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 if(!(CONTROL_COMMANDS as readonly unknown[]).includes(v.command))return null;
 if(v.agent!==undefined&&(typeof v.agent!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(v.agent)))return null;
 return {command:v.command as ControlCommand,...typeof v.agent==='string'?{agent:v.agent}:{}};
}

/** Listens on `file` for one JSON line per connection and answers it with one JSON line. A socket left by a host that
 * is gone is replaced; one a running host answers on is not (that host keeps it, and this one has no control). The
 * socket is owner-only (0600) from the moment it exists. */
export async function serveControl(file:string,answer:(request:ControlRequest)=>Promise<ControlReply>):Promise<net.Server> {
 if(process.platform!=='win32'&&fs.existsSync(file)){
  if(await answers(file))throw Error('Another Worldlet is running on this library.');
  fs.rmSync(file,{force:true});
 }
 const server=net.createServer(socket=>{
  let text='';
  socket.setEncoding('utf8');
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
   text+=chunk;
   if(text.length>LIMIT){socket.destroy();return;}
   const end=text.indexOf('\n');
   if(end<0)return;
   socket.removeAllListeners('data');
   let request:ControlRequest|null=null;try{request=readControlRequest(JSON.parse(text.slice(0,end)));}catch{}
   const reply=request?answer(request).catch((error:unknown):ControlReply=>({error:(error as Error)?.message||String(error)})):Promise.resolve<ControlReply>({error:'Unknown command.'});
   void reply.then(value=>socket.end(JSON.stringify(value)+'\n'));
  });
 });
 // The socket file is made owner-only as it is bound (listen binds before it returns; the mask is put back at once,
 // before anything else runs), and set so again once it exists.
 await new Promise<void>((resolve,reject)=>{
  server.once('error',reject);
  const mask=process.platform==='win32'?null:process.umask(0o177);
  try{server.listen(file,()=>{server.off('error',reject);resolve();});}finally{if(mask!==null)process.umask(mask);}
 });
 if(process.platform!=='win32')fs.chmodSync(file,0o600);
 server.on('close',()=>{if(process.platform!=='win32')fs.rmSync(file,{force:true});});
 return server;
}
const answers=(file:string)=>new Promise<boolean>(resolve=>{
 const socket=net.connect(file,()=>{socket.destroy();resolve(true);});
 socket.on('error',()=>resolve(false));
});

/** Asks the running host once. Null: no host answers on this library. */
export function askControl(file:string,request:ControlRequest,timeout=180_000):Promise<ControlReply|null> {
 return new Promise((resolve,reject)=>{
  let text='',connected=false;
  const socket=net.connect(file,()=>{connected=true;socket.write(JSON.stringify(request)+'\n');});
  socket.setEncoding('utf8');
  socket.setTimeout(timeout,()=>{socket.destroy();reject(Error('Worldlet did not answer in time.'));});
  socket.on('data',chunk=>{text+=chunk;if(text.length>LIMIT)socket.destroy();});
  socket.on('error',error=>{if(!connected)resolve(null);else reject(error);});
  socket.on('end',()=>{try{resolve(JSON.parse(text) as ControlReply);}catch{reject(Error('Worldlet gave an answer this command cannot read.'));}});
 });
}

export const CONTROL_USAGE=`Usage: worldlet <command>
  status                 Whether Worldlet is running, its Agent, setup and the MCP registrations
  link [--qr]            Print the browser link to this World, with --qr also as a QR code (keep it private: it opens the World)
  setup --agent <id>     Choose the Agent Fox talks through, and register Worldlet's MCP server in it
  register --agent <id>  Register Worldlet's MCP server and skill in an Agent (claude-code or codex)`;

/** The command line: parses `argv` (after the program), asks the host on `socket`, prints the answer. Returns the exit
 * code. */
export async function runControlCommand(argv:string[],socket:string,{out=(text:string)=>process.stdout.write(text),err=(text:string)=>process.stderr.write(text)}={}):Promise<number> {
 const [command,...rest]=argv;
 if(!(CONTROL_COMMANDS as readonly string[]).includes(command)){err(CONTROL_USAGE+'\n');return 2;}
 const at=rest.indexOf('--agent'),agent=at>=0?rest[at+1]:undefined;
 if((command==='setup'||command==='register')&&!agent){err(`worldlet ${command} needs --agent <id>.\n`);return 2;}
 const request=readControlRequest({command,...agent?{agent}:{}});
 if(!request){err(`Not an Agent name: ${agent}\n`);return 2;}
 let reply:ControlReply|null;
 try{reply=await askControl(socket,request);}
 catch(error){err(`worldlet: ${(error as Error).message}\n`);return 1;}
 if(!reply){err(NOT_RUNNING+'\n');return 3;}
 if('error' in reply){err(`worldlet: ${reply.error}\n`);return 1;}
 // `link --qr` adds the link's QR code, drawn here: the host only hands out the link.
 const lines=command==='link'&&rest.includes('--qr')&&reply.lines[0]?[...reply.lines,'',...terminalQr(reply.lines[0])]:reply.lines;
 out(lines.map(line=>line+'\n').join(''));
 return 0;
}
