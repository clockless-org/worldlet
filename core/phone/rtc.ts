// A direct line between a browser and the computer (README.md#direct), met through the pairing room (room.ts): once both
// are in the room, the browser offers a WebRTC data channel and the computer answers, each sealed with the pairing's key
// as a `{r:<box>}` frame, so the room can neither read nor swap them (the DTLS fingerprint is inside). While the channel
// is open the same sealed frames go over it, browser to computer, and the room only says who is there; when it closes or
// never opens, they go through the room as before. Either side that does not know `r` drops it and stays on the room.
/** Public STUN only (no TURN): what the channel cannot reach directly goes through the room. */
export const RTC_ICE_SERVERS=[{urls:'stun:stun.cloudflare.com:3478'}];
export const RTC_CHANNEL='worldlet';
/** The boxes' places: an offer from the browser, an answer from the computer. */
export const RTC_OFFER_PLACE='slot:rtc-offer',RTC_ANSWER_PLACE='slot:rtc-answer';
/** How long a side gathers its addresses before it sends what it has. */
export const RTC_GATHER_MS=3000;
// A data channel message is safe up to 16 KiB in every browser; a frame (a slot is up to about 300 KB) goes in pieces,
// each starting with `+` (more follows) or `.` (the last), in order on the one ordered channel.
const PIECE=16000,MAX_FRAME=2_000_000;
export function channelPieces(text:string){
 const pieces:string[]=[];
 for(let i=0;i<text.length;i+=PIECE)pieces.push((i+PIECE<text.length?'+':'.')+text.slice(i,i+PIECE));
 return pieces.length?pieces:['.'];
}
/** Joins pieces back into frames: returns a frame once its last piece arrived, else null. */
export function channelJoiner(){
 let parts='',dropping=false;
 return (data:unknown):string|null=>{
  if(typeof data!=='string'||!data)return null;
  const more=data[0]==='+';
  if(!dropping)parts+=data.slice(1);
  if(parts.length>MAX_FRAME){parts='';dropping=true;}
  if(more)return null;
  const text=dropping?null:parts;parts='';dropping=false;return text;
 };
}
/** Waits until `connection` gathered its addresses, or RTC_GATHER_MS. */
export function gathered(connection:{iceGatheringState:string,addEventListener(type:string,listener:()=>void):void,removeEventListener(type:string,listener:()=>void):void},ms=RTC_GATHER_MS){
 return new Promise<void>(resolve=>{
  if(connection.iceGatheringState==='complete'){resolve();return;}
  const timer=setTimeout(done,ms);
  function check(){if(connection.iceGatheringState==='complete')done();}
  function done(){clearTimeout(timer);connection.removeEventListener('icegatheringstatechange',check);resolve();}
  connection.addEventListener('icegatheringstatechange',check);
 });
}
