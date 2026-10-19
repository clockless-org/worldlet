import {RTC_CHANNEL,RTC_GATHER_MS,RTC_ICE_SERVERS,channelJoiner,channelPieces} from '../../../../../agent/windows/index.ts';

// The computer's side of browsers' direct lines (agent/windows rtc.ts), on the page in rtc-page.ts: a hidden window that
// is open only while a browser has a line or is offering one. `open` gives that page (rtc-window.ts in the app, a plain
// browser page in checks); the host joins the data channel's pieces into frames and splits frames into pieces.
export type RtcPage={run(code:string):Promise<unknown>,close():void};
export type RtcEvents={open(peer:string):void,message(peer:string,frame:string):void,closed(peer:string):void};
export type RtcHost={
 /** Answers a browser's offer; the answer's SDP, or null once the line is gone. */
 answer(peer:string,offer:string):Promise<string|null>,
 /** Sends a frame over the line; false when it is not open. */
 send(peer:string,frame:string):Promise<boolean>,
 close(peer:string):void,
 listen(events:RtcEvents):void,
};
export function createRtcHost(open:()=>RtcPage):RtcHost{
 let page:RtcPage|null=null,events:RtcEvents|null=null;
 const lines=new Set<string>(),joiners=new Map<string,ReturnType<typeof channelJoiner>>();
 function ensure(){
  if(page)return page;
  const current=open();page=current;
  // The page's events, in order, for as long as it is the page.
  void (async()=>{
   while(page===current){
    let batch:unknown;try{batch=await current.run('rtc.next()');}catch{batch=null;}
    if(page!==current)return;
    // The page is gone (its window closed or crashed): every line on it is closed.
    if(!Array.isArray(batch)){page=null;current.close();for(const peer of [...lines]){forget(peer);events?.closed(peer);}return;}
    for(const event of batch as {t:string,peer:string,data?:string}[]){
     if(!lines.has(event.peer))continue;
     if(event.t==='open'){joiners.set(event.peer,channelJoiner());events?.open(event.peer);}
     else if(event.t==='msg'){const frame=joiners.get(event.peer)?.(event.data);if(frame!==null&&frame!==undefined)events?.message(event.peer,frame);}
     else if(event.t==='closed'){forget(event.peer);events?.closed(event.peer);}
    }
   }
  })();
  return current;
 }
 function forget(peer:string){
  lines.delete(peer);joiners.delete(peer);
  // Nobody on a line: the hidden window goes.
  if(!lines.size&&page){const current=page;page=null;current.close();}
 }
 return {
  async answer(peer,offer){
   lines.add(peer);joiners.delete(peer);
   const answered=await ensure().run(`rtc.answer(${JSON.stringify(peer)},${JSON.stringify(offer)},${JSON.stringify(RTC_ICE_SERVERS)},${JSON.stringify(RTC_CHANNEL)},${RTC_GATHER_MS})`).catch(()=>null);
   if(typeof answered==='string'&&lines.has(peer))return answered;
   if(lines.has(peer))forget(peer);
   return null;
  },
  async send(peer,frame){
   if(!page||!joiners.has(peer))return false;
   return await page.run(`rtc.send(${JSON.stringify(peer)},${JSON.stringify(channelPieces(frame))})`).catch(()=>false)===true;
  },
  close(peer){
   if(!lines.has(peer))return;
   void page?.run(`rtc.close(${JSON.stringify(peer)})`).catch(()=>{});
   forget(peer);
  },
  listen(listener){events=listener;},
 };
}
