// The page that holds the computer's side of browsers' direct lines (agent/phone rtc.ts, rtc-host.ts): Node has no WebRTC,
// so a hidden window runs RTCPeerConnection and the host drives it with executeJavaScript. It answers offers, passes
// the data channel's pieces both ways and says when a line opens or closes. Kept apart from Electron so checks can load
// it in a plain browser.
export const RTC_PAGE_SCRIPT=`window.rtc=(()=>{
 const peers=new Map(),events=[];let waiting=null;
 const emit=event=>{events.push(event);if(waiting){const resolve=waiting;waiting=null;resolve();}};
 const gone=(peer,pc)=>{if(peers.get(peer)!==pc)return;peers.delete(peer);try{pc.close();}catch{}emit({t:'closed',peer});};
 function close(peer){const pc=peers.get(peer);if(!pc)return;peers.delete(peer);try{pc.close();}catch{}}
 async function answer(peer,offer,iceServers,label,gatherMs){
  close(peer);
  const pc=new RTCPeerConnection({iceServers});peers.set(peer,pc);
  pc.ondatachannel=event=>{
   const dc=event.channel;
   if(dc.label!==label||pc.channel){dc.close();return;}
   pc.channel=dc;
   const opened=()=>{if(peers.get(peer)===pc)emit({t:'open',peer});};
   if(dc.readyState==='open')opened();else dc.onopen=opened;
   dc.onmessage=message=>{if(peers.get(peer)===pc&&typeof message.data==='string')emit({t:'msg',peer,data:message.data});};
   dc.onclose=()=>gone(peer,pc);
  };
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')gone(peer,pc);};
  await pc.setRemoteDescription({type:'offer',sdp:offer});
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise(resolve=>{
   if(pc.iceGatheringState==='complete'){resolve();return;}
   const timer=setTimeout(resolve,gatherMs);
   pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve();}});
  });
  return peers.get(peer)===pc?pc.localDescription.sdp:null;
 }
 function send(peer,pieces){
  const dc=peers.get(peer)?.channel;
  if(!dc||dc.readyState!=='open')return false;
  for(const piece of pieces)dc.send(piece);
  return true;
 }
 const next=()=>events.length?Promise.resolve(events.splice(0)):new Promise(resolve=>{waiting=resolve;}).then(()=>events.splice(0));
 return {answer,send,close,next};
})();`;
export const RTC_PAGE=`<!doctype html><html><head><meta charset="utf-8"></head><body><script>${RTC_PAGE_SCRIPT}</script></body></html>`;
