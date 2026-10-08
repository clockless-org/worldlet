// Phone pairing protocol v1 (README.md in this folder). The desktop makes a 32-byte secret and shows it to the phone in
// a QR code. Everything else comes from that secret with HKDF-SHA256, identically on the desktop (WebCrypto) and the
// iPhone (CryptoKit, ios/Worldlet/Pairing.swift): the relay pairing id, one bearer token per side, and the AES-256-GCM
// key that seals every payload. The relay (worker/pairing.ts) stores only token hashes and sealed boxes.
export const PAIR_PROTOCOL=1;
export const PAIR_SALT='worldlet-pair-v1';
export const DEFAULT_PAIR_RELAY='https://worldlet.ai';
export type PairRole='desktop'|'phone';
export type PairKeys={id:string,desktopToken:string,phoneToken:string,key:CryptoKey};
export type PairLink={secret:Uint8Array,relay:string,name:string};
/** What a code pairs: a phone (`worldlet://pair`) or another Worldlet that runs Fox's turns on this computer's Agent
 * (`worldlet://agent`, README.md#another-computers-agent). Both use the same relay roles, keys and boxes; the
 * distinct link keeps a phone from scanning a computer's code and the reverse. */
export type PairKind='phone'|'agent';


const enc=new TextEncoder(),dec=new TextDecoder();
export function base64url(bytes:Uint8Array){
 let s='';for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function fromBase64url(text:string){
 if(!/^[A-Za-z0-9_-]*$/.test(text))throw new Error('Invalid base64url.');
 const s=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
 return Uint8Array.from(s,c=>c.charCodeAt(0));
}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const sha256Hex=async(text:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));

export function newPairSecret(){return crypto.getRandomValues(new Uint8Array(32));}

async function hkdf(secret:Uint8Array,info:string,length:number){
 const base=await crypto.subtle.importKey('raw',secret as BufferSource,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode(PAIR_SALT),info:enc.encode(info)},base,length*8));
}
export async function pairKeys(secret:Uint8Array):Promise<PairKeys>{
 if(secret.length!==32)throw new Error('A pairing secret is 32 bytes.');
 const [id,desktop,phone,key]=await Promise.all([hkdf(secret,'id',16),hkdf(secret,'desktop',32),hkdf(secret,'phone',32),hkdf(secret,'key',32)]);
 return {id:base64url(id),desktopToken:base64url(desktop),phoneToken:base64url(phone),
  key:await crypto.subtle.importKey('raw',key as BufferSource,'AES-GCM',false,['encrypt','decrypt'])};
}

// worldlet://pair?v=1&s=<secret>&n=<computer name>[&r=<relay origin>]. The relay is omitted when it is the default.
// A computer's code for another Worldlet is the same with `agent` in place of `pair`.
const LINK_PATH:Record<PairKind,string>={phone:'pair',agent:'agent'};
export function pairLink({secret,relay=DEFAULT_PAIR_RELAY,name,kind='phone'}:{secret:Uint8Array,relay?:string,name:string,kind?:PairKind}){
 const q=new URLSearchParams({v:String(PAIR_PROTOCOL),s:base64url(secret),n:name.slice(0,64)});
 if(relay!==DEFAULT_PAIR_RELAY)q.set('r',relay);
 return `worldlet://${LINK_PATH[kind]}?${q}`;
}
export function readPairLink(text:string,kind:PairKind='phone'):PairLink{
 const m=new RegExp(`^worldlet://${LINK_PATH[kind]}\\?(.*)$`).exec(text.trim());
 if(!m)throw new Error(kind==='agent'?'This is not a code from Worldlet on another computer.':'This is not a Worldlet pairing code.');
 const q=new URLSearchParams(m[1]);
 if(q.get('v')!==String(PAIR_PROTOCOL))throw new Error('Update Worldlet to pair with this computer.');
 const secret=fromBase64url(q.get('s')||'');
 if(secret.length!==32)throw new Error('This pairing code is incomplete.');
 const relay=q.get('r')||DEFAULT_PAIR_RELAY;
 if(!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(relay)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(relay))throw new Error('This pairing code names an unknown relay.');
 return {secret,relay,name:(q.get('n')||'').slice(0,64)};
}

// A box is base64url(12-byte IV | ciphertext | 16-byte tag). The additional data binds it to its pairing and its
// place ("slot:attention", "to:desktop"), so the relay cannot move a box to another pairing, slot or direction.
export const boxPlace=(kind:'slot'|'to',name:string)=>`${kind}:${name}`;
/** A notification's place is `push` alone: the relay hands it to Apple or Google, and only the phone opens it. */
export const PUSH_BOX_PLACE='push';
export async function sealBox(keys:PairKeys,place:string,value:unknown){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const sealed=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`${keys.id}|${place}`)},keys.key,enc.encode(JSON.stringify(value))));
 const out=new Uint8Array(12+sealed.length);out.set(iv);out.set(sealed,12);
 return base64url(out);
}
export async function openBox(keys:PairKeys,place:string,box:string):Promise<unknown>{
 const bytes=fromBase64url(box);
 if(bytes.length<28)throw new Error('Sealed payload is too short.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:enc.encode(`${keys.id}|${place}`)},keys.key,bytes.slice(12));
 return JSON.parse(dec.decode(plain));
}

// Replay (README.md in this folder). A box's additional data binds it to its pairing and place but not to a time, so the
// relay could queue an old sealed message again. The desktop remembers what it accepted (persistently, bounded) and
// refuses a message whose own sealed time is more than a week old.
/** Accepted phone messages remembered across restarts, so a relay that queues an old sealed box again cannot replay it. */
export const PHONE_SEEN_LIMIT=2000;
/** A message whose sealed time (`at`, when the phone sends one) is older than this is refused as stale. */
export const PHONE_MESSAGE_MAX_AGE_MS=7*86400_000;
/** One delivery's identity. Most messages carry a fresh id per send, so a phone's retry of the same message (sealed
 * again) is still taken once. An Attention action carries the item's id, so a later, different or repeated action on
 * that item is a new message: it is known by its sealed box instead, which only an exact replay repeats. */
export async function phoneMessageKey(message:{type:string,id:string},box:string){
 return message.type==='attention'?'b:'+(await sha256Hex(box)).slice(0,32):'m:'+message.type+':'+message.id;
}
/** Whether a sealed message's own time, when present, is too old to act on. Older phone builds send none. */
export function stalePhoneMessage(value:unknown,now:number){
 const at=(value as {at?:unknown})?.at;
 // An ISO time, or epoch seconds or milliseconds.
 const time=typeof at==='number'?(at<1e12?at*1000:at):typeof at==='string'?Date.parse(at):NaN;
 return Number.isFinite(time)&&now-time>PHONE_MESSAGE_MAX_AGE_MS;
}
