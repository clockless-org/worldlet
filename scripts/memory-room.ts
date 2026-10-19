import {sha256Hex} from '../platform/web/index.ts';

// The pairing room (agent/base room.ts) for checks: a room that answers like worker/room.ts in the operations repository
// (a side gets in with its token and the other side's hash, messages pass only while both are there, nothing is kept),
// here in memory, and a WebSocket on it for the code under test (scripts/web-open-check.ts, phone-room-check.ts).
export function memoryRoom(){
 const rooms=new Map<string,{desktop:{id:string,deliver:(text:string)=>void,close:()=>void}|null,phones:Map<string,{deliver:(text:string)=>void,close:()=>void}>}>();
 let next=0;
 /** Opens one side; null when the room refuses it. */
 async function connect(url:string,protocols:string[],deliver:(text:string)=>void,closed:()=>void){
  const name=new URL(url).pathname.split('/')[3]||'',[role,token,peer]=(protocols.find(p=>p!=='worldlet-room.v1')||'').split('.');
  const own=await sha256Hex(token||'');
  if(!protocols.includes('worldlet-room.v1')||await sha256Hex(role==='desktop'?own+':'+peer:peer+':'+own)!==name)return null;
  const room=rooms.get(name)??{desktop:null,phones:new Map()};rooms.set(name,room);
  const id=role==='desktop'?'desktop':'p'+(++next),side={id,deliver,close:closed};
  const say=(to:{deliver:(text:string)=>void},value:unknown)=>to.deliver(JSON.stringify(value));
  if(role==='desktop'){room.desktop?.close();room.desktop=side;for(const [pid,phone] of room.phones){say(phone,{t:'desktop',online:true});say(side,{t:'peer',id:pid,online:true});}}
  else{room.phones.set(id,side);say(side,{t:'desktop',online:!!room.desktop});if(room.desktop)say(room.desktop,{t:'peer',id,online:true});}
  return {
   send(text:string){
    const input=JSON.parse(text);
    if(role==='phone'){if(room.desktop)say(room.desktop,{t:'msg',from:id,data:input.data});return;}
    if(room.desktop!==side)return;
    for(const [pid,phone] of room.phones)if(!input.to||input.to===pid)say(phone,{t:'msg',from:'desktop',data:input.data});
   },
   leave(){
    if(role==='desktop'){if(room.desktop!==side)return;room.desktop=null;for(const phone of room.phones.values())say(phone,{t:'desktop',online:false});}
    else{room.phones.delete(id);if(room.desktop)say(room.desktop,{t:'peer',id,online:false});}
   },
  };
 }
 /** A WebSocket for code under test, on this room. */
 const Socket=class RoomSocket {
  readyState=0;onopen:((e:unknown)=>void)|null=null;onmessage:((e:{data:unknown})=>void)|null=null;onclose:((e:unknown)=>void)|null=null;onerror:((e:unknown)=>void)|null=null;
  private side:{send(text:string):void,leave():void}|null=null;
  constructor(url:string,protocols:string[]){
   // As on a real WebSocket, nothing arrives before the socket is open.
   const early:string[]=[];
   void connect(url,protocols,text=>{if(this.readyState===0)early.push(text);else queueMicrotask(()=>this.onmessage?.({data:text}));},()=>this.close()).then(side=>{
    if(!side){this.readyState=3;this.onerror?.({});this.onclose?.({});return;}
    this.side=side;this.readyState=1;this.onopen?.({});
    for(const text of early.splice(0))queueMicrotask(()=>this.onmessage?.({data:text}));
   });
  }
  send(text:string){if(this.readyState!==1)throw new Error('not open');this.side!.send(text);}
  close(){if(this.readyState>=2)return;this.readyState=3;this.side?.leave();queueMicrotask(()=>this.onclose?.({}));}
 };
 return {connect,Socket,
  /** Drops the computer's connection, as a sleeping laptop does. */
  dropDesktop(){for(const room of rooms.values())room.desktop?.close();},
 };
}
