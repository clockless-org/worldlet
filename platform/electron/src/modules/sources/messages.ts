import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {app,shell} from 'electron';
import {MESSAGES_LIMITS,messagesConversation,messagesLine,messagesOutgoingText,messagesRecipient,messagesSendFailure,messagesSnippet,validSentMessageId,type MessagesConversation,type MessagesLine,type SentMessageRecord} from '../../../../../core/applets/index.ts';
import {WorldletError} from '../../files.ts';
import {bundledResource} from '../../resources.ts';
import {Imsg,ImsgError} from './imsg.ts';
import type {SourcesContext} from './context.ts';
import {relaunchAfterQuit} from '../../host/quit.ts';
import type {Row} from '../../host/types.ts';
// Messages (iMessage) on a Mac (core/applets/messages.ts holds the rules). Conversations are read and
// messages sent through the pinned imsg release over `imsg rpc` (./imsg.ts): it reads Apple's local
// `~/Library/Messages/chat.db`, which macOS keeps behind Full Disk Access, and sends through the Messages
// app (Automation permission for Messages), so a message goes out under the person's own Apple ID and never
// through a Worldlet server. Contacts gives conversations their people's names. Only the person's Send click
// sends: no Agent and no background task can. What Worldlet sent is kept in the World (`sent_messages`).

const RETRY='worldlet.messages.retryAfterRestart';
const CONNECTION={id:'messages-local',provider:'messages',target:'Messages on this Mac',transport:'native',syncStatus:'connected'};
const SETTINGS={
 'full-disk':'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
 automation:'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
} as const;
type Access=keyof typeof SETTINGS;
// Messages keeps the files people send here; only these are ever shown in Finder.
const ATTACHMENTS=path.join(os.homedir(),'Library/Messages/Attachments');

function appBundle(){const match=/^(.*?\.app)(?:\/|$)/.exec(process.execPath);return match?match[1]:process.execPath;}
const database=()=>path.join(os.homedir(),'Library/Messages/chat.db');

/** Whether this copy of Worldlet can read chat.db: macOS answers EPERM until Full Disk Access is on. */
function readable():'ok'|'full-disk'|'missing' {
 try{fs.closeSync(fs.openSync(database(),'r'));return 'ok';}
 catch(error){return (error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'full-disk';}
}
const shortTime=(at:number|null)=>at?new Date(at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'';

export function createMessages(ctx:SourcesContext){
 const {store,host}=ctx;
 const imsg=new Imsg(()=>bundledResource(host.profile,'imsg'));
 app.once('will-quit',()=>imsg.stop());
 /** The conversations imsg listed last, by guid: the Applet names chats by their portable guid. */
 const known=new Map<string,MessagesConversation>();
 /** Files in the conversation shown, by a token the Applet holds instead of the path. */
 const files=new Map<string,string>();
 const connections=():Row[]=>store.state.connections;
 const connect=()=>{
  if(connections().some(c=>c.provider==='messages'))return;
  store.state.connections.push({...CONNECTION});store.changed();
 };
 /** imsg refusing to read for want of Full Disk Access reads as the permission prompt. */
 async function reading(work:()=>Promise<Row>):Promise<Row> {
  try{return await work();}
  catch(error){
   if(error instanceof ImsgError&&error.code===-32002)return {connected:false,pages:[],access:'full-disk'};
   if(error instanceof ImsgError)throw new WorldletError(error.code===-1?'Messages could not be read on this Mac. Try again.':'Messages could not be read: '+error.message);
   throw error;
  }
 }
 const bubble=(line:MessagesLine)=>({id:line.id,row:line.row,fromMe:line.fromMe,sender:line.sender,text:line.text,at:line.at,
  attachments:line.attachments.map(a=>{
   let token='';
   if(!a.missing&&a.file){token=crypto.randomUUID();files.set(token,a.file);}
   return {name:a.name,mime:a.mime,bytes:a.bytes,missing:a.missing,token};
  })});

 async function conversations():Promise<Row> {
  const {chats}=await imsg.request('chats.list',{limit:MESSAGES_LIMITS.conversations});
  const list=(Array.isArray(chats)?chats:[]).map(messagesConversation).filter((c):c is MessagesConversation=>!!c);
  for(const chat of list)known.set(chat.guid,chat);
  // Each card says who spoke last and what they said (imsg reads up to four of these at a time).
  const last=await Promise.all(list.map(chat=>imsg.request('messages.history',{chat_id:chat.chat,limit:1}).then(r=>Array.isArray(r.messages)?messagesLine(r.messages[0]):null,()=>null)));
  const pages=list.map((chat,i)=>{
   const said=last[i];
   const snippet=said?messagesSnippet(said.text||said.attachments[0]?.name||'Attachment',said.fromMe):'';
   return {id:chat.guid,title:chat.title,list:[snippet,shortTime(chat.at)].filter(Boolean).join(' · '),modified:chat.at?chat.at/1000:0,participants:chat.participants};
  });
  return {connected:true,pages,scope:'Messages on this Mac · Your Apple ID · '+pages.length+' recent conversations'};
 }

 async function conversation(guid:string):Promise<MessagesConversation> {
  if(!known.has(guid)){
   const {chats}=await imsg.request('chats.list',{limit:500});
   for(const value of Array.isArray(chats)?chats:[]){const chat=messagesConversation(value);if(chat)known.set(chat.guid,chat);}
  }
  const found=known.get(guid);
  if(!found)throw new WorldletError('This conversation is no longer in Messages.');
  return found;
 }

 async function thread(guid:string):Promise<Row> {
  const chat=await conversation(guid);
  const {messages}=await imsg.request('messages.history',{chat_id:chat.chat,limit:MESSAGES_LIMITS.thread,attachments:true});
  const lines=(Array.isArray(messages)?messages:[]).map(messagesLine).filter((m):m is MessagesLine=>!!m).sort((a,b)=>a.row-b.row);
  files.clear();
  return {id:guid,title:chat.title,participants:chat.participants,group:chat.group,messages:lines.map(bubble),cursor:lines.reduce((top,m)=>Math.max(top,m.row),0)};
 }

 /** Waits for new messages in an open conversation; the Applet asks again after each answer. */
 async function wait(guid:string,after:unknown):Promise<Row> {
  const chat=await conversation(guid);
  const from=Number.isSafeInteger(after)&&Number(after)>0?Number(after):0;
  const found=(await imsg.newMessages(chat.chat,from)).map(messagesLine).filter((m):m is MessagesLine=>!!m);
  return {messages:found.map(bubble),cursor:found.reduce((top,m)=>Math.max(top,m.row),from)};
 }

 async function send(body:Row):Promise<Row> {
  const id=body.id,words=messagesOutgoingText(body.text);
  if(!validSentMessageId(id))throw new WorldletError('Write the message again.');
  if(words===null)throw new WorldletError(`Write a message of up to ${MESSAGES_LIMITS.text.toLocaleString()} characters.`);
  const ledger=store.ledger();
  // A sent message cannot be called back, so one Send click sends once.
  if(ledger.sentMessage(id))throw new WorldletError('This message was already sent.');
  let params:Row,record:SentMessageRecord;
  const at=new Date().toISOString();
  if(typeof body.chat==='string'&&body.chat){
   if(readable()!=='ok')return {needsAccess:'full-disk'};
   const chat=await conversation(body.chat);
   params={chat_guid:chat.guid,text:words};
   record={id,at,chat:chat.guid,to:chat.participants.join(', '),title:chat.title,text:words,status:'sending'};
  }else{
   const to=messagesRecipient(body.to);
   if(!to)throw new WorldletError('Enter a phone number or an email address that uses iMessage.');
   // iMessage only: a new person is never quietly sent an SMS instead.
   params={to,text:words,service:'imessage'};
   record={id,at,chat:'',to,title:to,text:words,status:'sending'};
  }
  ledger.saveSentMessage(record);
  try{
   // The first send waits on macOS asking the person to let Worldlet control Messages.
   const result=await imsg.request('send',params,{timeout:120_000});
   const sent:SentMessageRecord={...record,status:'sent',...(typeof result.guid==='string'&&result.guid?{guid:result.guid}:{})};
   ledger.saveSentMessage(sent);connect();
   return {sent:true,record:sent};
  }catch(error){
   const failure=error instanceof ImsgError?messagesSendFailure(error):'unconfirmed';
   // Only an attempt Messages never started is forgotten, so the same words can be sent once it is allowed.
   if(failure==='automation'||failure==='full-disk'){ledger.deleteSentMessage(id);return {needsAccess:failure};}
   const detail=(error as Error).message.slice(0,300);
   if(failure==='not-sent'){
    ledger.saveSentMessage({...record,status:'failed',error:detail});
    throw new WorldletError('Messages could not send this, and nothing was sent. Check that iMessage is signed in, then try again.');
   }
   // An uncertain send keeps imsg from sending more until it starts again.
   if(error instanceof ImsgError&&(error.code===-32004||(error.data as Row|null)?.disposition==='still_in_flight'))imsg.stop();
   ledger.saveSentMessage({...record,status:'unconfirmed',error:detail});
   throw new WorldletError('Messages did not confirm sending. Check Messages before sending again.');
  }
 }

 async function handle(body:Row):Promise<Row> {
  const operation=typeof body.operation==='string'?body.operation:'list';
  if(process.platform!=='darwin')throw new WorldletError('Messages is available in Worldlet for Mac.');
  if(!store.writable||store.sampleEnabled())throw new WorldletError('Use your personal Mac world to read and send messages.');
  if(!['list','permissions','restart','thread','wait','attachment','send','sent','disconnect'].includes(operation))throw new WorldletError('Unknown Messages operation.');
  if(operation==='list'&&host.preferences.bool(RETRY))host.preferences.remove(RETRY);
  if(operation==='restart'){
   host.preferences.set(RETRY,true);
   relaunchAfterQuit();
   setTimeout(()=>app.quit(),50);
   return {restarting:true};
  }
  if(operation==='permissions'){
   const access:Access=body.access==='automation'?'automation':'full-disk';
   // Full Disk Access lists apps the person adds: show this exact app so it can be dragged in.
   if(access==='full-disk')shell.showItemInFolder(appBundle());
   void shell.openExternal(SETTINGS[access]);
   return {awaitingPermission:access,appName:app.getName()};
  }
  if(operation==='disconnect'){
   imsg.stop();known.clear();files.clear();
   store.state.connections=connections().filter(c=>c.provider!=='messages');store.changed();
   return {connected:false,pages:[]};
  }
  if(operation==='sent')return {sent:store.ledger().sentMessages(20)};
  if(operation==='send')return send(body);
  if(operation==='attachment'){
   // Shown in Finder, never opened: a file from someone else could be an app.
   const file=typeof body.token==='string'?files.get(body.token):undefined;
   let real='';
   try{real=file?fs.realpathSync.native(file.replace(/^~(?=\/)/,os.homedir())):'';}catch{}
   if(!real||!real.startsWith(ATTACHMENTS+path.sep))throw new WorldletError('This attachment is not on this Mac.');
   shell.showItemInFolder(real);
   return {shown:true};
  }
  const access=readable();
  if(access!=='ok')return {connected:false,pages:[],access};
  if(operation==='thread'||operation==='wait'){
   if(typeof body.id!=='string'||!body.id)throw new WorldletError('Choose a conversation first.');
   const guid=body.id;
   return reading(()=>operation==='thread'?thread(guid):wait(guid,body.after));
  }
  const value=await reading(conversations);
  if(value.connected)connect();
  return value;
 }
 return {
  handle,
  /** After Restart Worldlet, the World opens Messages again so it can retry with the new permission. */
  retryAfterRestart:()=>host.preferences.bool(RETRY)
 };
}
