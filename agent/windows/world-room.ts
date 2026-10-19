import {base64url,fromBase64url,openBox,PAIR_PROTOCOL,sealBox,type PairKeys,type PairLink} from './pairing.ts';
import {ROOM_LINK_MODE} from './room.ts';

// The full World on another device, met in the pairing room (README.md#the-world-on-another-device): the World page,
// a static copy of the interface build that holds no data (served at worldlet.ai/world/<version>/), joins the room from
// its link's fragment as the `phone` side, and this computer answers it with the same frames it sends a browser's World
// page on this computer over its socket (contracts/web-world.ts). The room only forwards; it stores nothing. A `world`
// pairing has its own secret, separate from the Center-only `web` link, so either can be turned off alone.
//
// Inside the room's `data` every frame is sealed with the pairing's key:
// - `{wh}` hello, computer to page (place `world:hello`): `{host}`, a fresh nonce for this page's session.
// - `{wj}` join, page to computer (place `world:join:<host>`): `{page}`, the page's own fresh nonce.
// - `{w}` a piece of one socket frame, either way (place `world:<host>.<page>:<to>:<seq>`): `{t,more}`. Pieces are
//   numbered from 0 in each direction and must arrive in order, so the room cannot replay, reorder, drop silently or
//   move a piece to another session; a frame larger than one piece (snapshots and art arrive as data URLs) goes in
//   several, each well under the room's message size however its text encodes.
export const WORLD_ROOM_FRAME={hello:'wh',join:'wj',piece:'w'} as const;
/** Characters of a frame per sealed piece, at most. */
export const WORLD_ROOM_PIECE=100_000;
/** UTF-8 bytes of a piece's sealed JSON, at most: its box is about 4/3 of that, well under the room's 300,000
 * characters, whatever the text (Chinese takes 3 bytes a character, a quote 2 once escaped). */
export const WORLD_ROOM_PIECE_BYTES=150_000;
const utf8=new TextEncoder();
/** The next piece of `text` from `start`: WORLD_ROOM_PIECE characters, fewer where they encode to more than
 * WORLD_ROOM_PIECE_BYTES. */
function nextPiece(text:string,start:number):string{
 let length=WORLD_ROOM_PIECE;
 for(;;){
  const piece=text.slice(start,start+length),bytes=utf8.encode(JSON.stringify(piece)).length;
  if(bytes<=WORLD_ROOM_PIECE_BYTES)return piece;
  length=Math.max(1,Math.floor(length*WORLD_ROOM_PIECE_BYTES/bytes*0.95));
 }
}
/** The largest frame either side puts together (the local socket's limit too). */
export const WORLD_ROOM_FRAME_LIMIT=32*1024*1024;
/** Where the World bundle lives on the relay: one folder per version, so a page always matches its computer. */
export const worldBundlePath=(version:string)=>`/world/${encodeURIComponent(version)}/`;
const BUNDLE_PATH=/^\/world\/[^/]+\/(index\.html)?$/;

/** A `world` link: the World bundle's address with the pairing in its fragment, which a browser never sends. */
export function worldRoomLink({base,secret,name}:{base:string,secret:Uint8Array,name:string}){
 const q=new URLSearchParams({v:String(PAIR_PROTOCOL),s:base64url(secret),n:name.slice(0,64),m:ROOM_LINK_MODE});
 return `${base}#${q}`;
}
/** A `world` link, or only its fragment as the page reads it from `location.hash`; the relay is the link's origin (a
 * bare fragment has none: the page uses its own). */
export function readWorldRoomLink(text:string):PairLink{
 const value=text.trim(),at=value.indexOf('#'),fragment=at>=0?value.slice(at+1):value;
 let relay='';
 if(at>0){
  let url:URL;try{url=new URL(value);}catch{throw new Error('This is not a Worldlet World link.');}
  if(!BUNDLE_PATH.test(url.pathname))throw new Error('This is not a Worldlet World link.');
  relay=url.origin;
  if(!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(relay)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(relay))throw new Error('This link names an unknown relay.');
 }
 const q=new URLSearchParams(fragment);
 if(q.get('m')!==ROOM_LINK_MODE||!q.get('s'))throw new Error('This link has no World in it. Open Worldlet on your computer and copy the link again.');
 if(q.get('v')!==String(PAIR_PROTOCOL))throw new Error('Update Worldlet on your computer to open it here.');
 const secret=fromBase64url(q.get('s')||'');
 if(secret.length!==32)throw new Error('This link is incomplete. Copy it again from Worldlet on your computer.');
 return {secret,relay,name:(q.get('n')||'').slice(0,64)};
}
/** Whether a page at `pathname` with this fragment is the World joining a room. */
export const isWorldRoomPage=(pathname:string,hash:string)=>BUNDLE_PATH.test(pathname)&&(()=>{try{readWorldRoomLink(hash);return true;}catch{return false;}})();

/** A fresh nonce: 16 random bytes, base64url. */
export const worldRoomNonce=()=>base64url(crypto.getRandomValues(new Uint8Array(16)));
const NONCE=/^[A-Za-z0-9_-]{22}$/;
export const helloPlace='world:hello',joinPlace=(host:string)=>`world:join:${host}`;
const piecePlace=(host:string,page:string,to:'desktop'|'page',seq:number)=>`world:${host}.${page}:${to}:${seq}`;
/** The room frame (its `data`) of a hello or a join. */
export const sealHello=async(keys:PairKeys,host:string)=>JSON.stringify({[WORLD_ROOM_FRAME.hello]:await sealBox(keys,helloPlace,{host})});
export const sealJoin=async(keys:PairKeys,host:string,page:string)=>JSON.stringify({[WORLD_ROOM_FRAME.join]:await sealBox(keys,joinPlace(host),{page})});
/** A hello's nonce, or '' when the box is not one. */
export async function openHello(keys:PairKeys,box:string){const v:any=await openBox(keys,helloPlace,box).catch(()=>null);return typeof v?.host==='string'&&NONCE.test(v.host)?v.host:'';}
/** A join's page nonce for this hello, or ''. */
export async function openJoin(keys:PairKeys,host:string,box:string){const v:any=await openBox(keys,joinPlace(host),box).catch(()=>null);return typeof v?.page==='string'&&NONCE.test(v.page)?v.page:'';}
/** A room frame's kind and box, or null. */
export function readWorldRoomFrame(data:unknown):{kind:'hello'|'join'|'piece',box:string}|null{
 if(typeof data!=='string')return null;
 let value:any;try{value=JSON.parse(data);}catch{return null;}
 for(const kind of ['hello','join','piece'] as const){const box=value?.[WORLD_ROOM_FRAME[kind]];if(typeof box==='string')return {kind,box};}
 return null;
}

/** One session's two directions, on one side (`as`): `seal` turns a socket frame into the room frames that carry it,
 * `open` takes them back in order and returns the whole frame once its last piece arrived. A piece out of order, of
 * another session or not sealed with this key throws: the session is then over. */
export function worldRoomSession(keys:PairKeys,host:string,page:string,as:'desktop'|'page'){
 // A piece's place names where it goes: what this side seals goes to the other, what it opens came to it.
 const to=as==='desktop'?'page':'desktop',me=as;
 let sent=0,got=0,parts:string[]=[],size=0;
 return {
  async seal(text:string):Promise<string[]>{
   const out:string[]=[];
   let i=0;
   do{
    const t=nextPiece(text,i);i+=t.length;
    out.push(JSON.stringify({[WORLD_ROOM_FRAME.piece]:await sealBox(keys,piecePlace(host,page,to,sent++),{t,more:i<text.length})}));
   }while(i<text.length);
   return out;
  },
  async open(box:string):Promise<string|null>{
   const value:any=await openBox(keys,piecePlace(host,page,me,got),box);
   if(typeof value?.t!=='string')throw new Error('Not a World frame.');
   got++;size+=value.t.length;
   if(size>WORLD_ROOM_FRAME_LIMIT)throw new Error('A World frame is too large.');
   parts.push(value.t);
   if(value.more===true)return null;
   const text=parts.join('');parts=[];size=0;return text;
  },
 };
}
export type WorldRoomSession=ReturnType<typeof worldRoomSession>;

// The browser link (`kind: 'web'`, the Center and Fox at /open/) also carries the World's pairing when there is one
// (`w`, its secret, and `wv`, the bundle's version), so one link opens the full World on a device that can draw it and
// the Center on one that cannot (README.md#the-world-on-another-device).
/** The browser link with the World's pairing added, from the `world` link; the browser link alone without one. */
export function withWorldLink(webLink:string,worldLink?:string|null):string {
 if(!worldLink)return webLink;
 let url:URL;try{url=new URL(worldLink);}catch{return webLink;}
 const version=/^\/world\/([^/]+)\/$/.exec(url.pathname)?.[1],secret=new URLSearchParams(url.hash.slice(1)).get('s');
 if(!version||!secret)return webLink;
 return `${webLink}&${new URLSearchParams({w:secret,wv:decodeURIComponent(version)})}`;
}
/** The full World's link a browser link carries (on the origin that served the page), or ''. */
export function worldLinkFromWeb(webLink:string,origin:string):string {
 const fragment=webLink.slice(webLink.indexOf('#')+1),q=new URLSearchParams(fragment),secret=q.get('w')||'',version=q.get('wv')||'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(secret)||!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(version))return '';
 return worldRoomLink({base:origin+worldBundlePath(version),secret:fromBase64url(secret),name:q.get('n')||''});
}
/** What a page can tell about its device. */
export type WorldDevice={webgl:boolean,memory?:number,cores?:number,width:number,height:number,touch?:boolean,saveData?:boolean};
/** Whether this device can draw the full World well: WebGL, a screen that is not a phone's, and the memory and cores
 * of a computer or tablet where the browser says (Chrome does; Safari and Firefox do not). A phone gets the Center and
 * Fox, as in the phone apps. */
export function canRenderWorld(device:WorldDevice):boolean {
 if(!device.webgl||device.saveData)return false;
 if(Math.min(device.width,device.height)<600)return false;
 if(device.memory!==undefined&&device.memory<4)return false;
 if(device.cores!==undefined&&device.cores<4)return false;
 return true;
}
