import crypto from 'node:crypto';
import type http from 'node:http';
import type {Duplex} from 'node:stream';
// A text-only WebSocket server side (RFC 6455) for the World page on this computer (local-relay.ts): the handshake,
// masked frames from the page, fragments, ping and close. Binary frames, extensions and oversized messages close the
// socket. Kept here, small, so the host ships no WebSocket package.
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** The largest message either side sends: snapshots and art arrive as data URLs. */
export const WEB_SOCKET_MESSAGE_LIMIT=32*1024*1024;

/** One open socket, as host/web-page.ts uses it. */
export interface TextSocket {
 send(text:string):void;
 close(code?:number,reason?:string):void;
 onMessage(listener:(text:string)=>void):void;
 onClose(listener:()=>void):void;
}

/** Answers an upgrade with an HTTP error and drops the connection. */
export function refuseUpgrade(socket:Duplex,status:number,text:string){
 if(socket.writable)socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
 socket.destroy();
}

/** Completes the handshake (`protocol` is the subprotocol the server answers with) or refuses a malformed one. */
export function acceptWebSocket(request:http.IncomingMessage,socket:Duplex,head:Buffer,protocol:string,limit=WEB_SOCKET_MESSAGE_LIMIT):TextSocket|null {
 const key=String(request.headers['sec-websocket-key']||'');
 if(request.method!=='GET'||String(request.headers.upgrade||'').toLowerCase()!=='websocket'||request.headers['sec-websocket-version']!=='13'||!/^[A-Za-z0-9+/]{22}==$/.test(key)){refuseUpgrade(socket,400,'Bad Request');return null;}
 const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
 socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: ${protocol}\r\n\r\n`);
 const messages:((text:string)=>void)[]=[],closes:(()=>void)[]=[];
 let buffer:Buffer=head.length?Buffer.from(head):Buffer.alloc(0),parts:Buffer[]=[],partsLength=0,open=true,ended=false;
 const frame=(opcode:number,payload:Buffer)=>{
  const length=payload.length,header=length<126?Buffer.from([0x80|opcode,length]):length<65536?Buffer.alloc(4):Buffer.alloc(10);
  if(length>=126&&length<65536){header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(length,2);}
  else if(length>=65536){header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(length),2);}
  return Buffer.concat([header,payload]);
 };
 const finish=()=>{
  if(ended)return;
  ended=true;open=false;
  for(const listener of closes)try{listener();}catch{}
 };
 const close=(code=1000,reason='')=>{
  if(!open){socket.destroy();return finish();}
  open=false;
  const body=Buffer.alloc(2+Buffer.byteLength(reason));body.writeUInt16BE(code,0);body.write(reason,2);
  try{socket.end(frame(8,body.subarray(0,125)));}catch{}
  // The page answers with its own close; one that does not is dropped.
  setTimeout(()=>socket.destroy(),1000).unref();
  finish();
 };
 const read=()=>{
  while(buffer.length>=2){
   const fin=(buffer[0]&0x80)!==0,opcode=buffer[0]&0x0f,masked=(buffer[1]&0x80)!==0;
   if(buffer[0]&0x70||!masked)return close(1002,'Protocol error');
   let length=buffer[1]&0x7f,offset=2;
   if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
   else if(length===127){if(buffer.length<10)return;const long=buffer.readBigUInt64BE(2);if(long>BigInt(limit))return close(1009,'Too large');length=Number(long);offset=10;}
   if(length>limit||partsLength+length>limit)return close(1009,'Too large');
   if(buffer.length<offset+4+length)return;
   const mask=buffer.subarray(offset,offset+4),payload=Buffer.from(buffer.subarray(offset+4,offset+4+length));
   for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
   buffer=buffer.subarray(offset+4+length);
   if(opcode===8)return close();
   if(opcode===9){if(open)socket.write(frame(10,payload.subarray(0,125)));continue;}
   if(opcode===10)continue;
   if(opcode===2||opcode>2||(opcode===0)===(partsLength===0&&!parts.length))return close(opcode===2?1003:1002,opcode===2?'Text only':'Protocol error');
   parts.push(payload);partsLength+=payload.length;
   if(!fin)continue;
   const text=Buffer.concat(parts).toString('utf8');parts=[];partsLength=0;
   for(const listener of messages)try{listener(text);}catch{}
   if(!open)return;
  }
 };
 socket.on('data',(chunk:Buffer)=>{if(!open)return;buffer=buffer.length?Buffer.concat([buffer,chunk]):chunk;if(buffer.length>limit+14)return close(1009,'Too large');read();});
 socket.on('close',finish);
 socket.on('error',()=>{socket.destroy();finish();});
 if(buffer.length)queueMicrotask(read);
 return {
  send(text){if(open)socket.write(frame(1,Buffer.from(text,'utf8')));},
  close,
  onMessage(listener){messages.push(listener);},
  onClose(listener){closes.push(listener);},
 };
}
