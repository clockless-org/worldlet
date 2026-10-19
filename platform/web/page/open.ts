import {mountWebOpen,worldAnswers} from './index.ts';

// The page's entry (open.html): Worldlet in this browser, against the relay that served the page.
declare const WORLDLET_VERSION:string;
/** Whether this browser can draw WebGL at all; the rest is what it says of its device. */
function webgl(){try{const canvas=document.createElement('canvas');return !!(canvas.getContext('webgl2')||canvas.getContext('webgl'));}catch{return false;}}
const device={webgl:webgl(),memory:(navigator as {deviceMemory?:number}).deviceMemory,cores:navigator.hardwareConcurrency||undefined,width:screen.width,height:screen.height,
 saveData:(navigator as {connection?:{saveData?:boolean}}).connection?.saveData===true};
const root=document.getElementById('worldlet')!;
// The full World only where the relay answers for its bundle (worldAnswers); otherwise this page shows the Center. The
// first mount goes on to the World by itself where the device can draw it; a press of Open the full World comes later.
let mounting=true;
const mount=(here?:typeof device)=>mountWebOpen(root,{fetch:(input,init)=>fetch(input,init),storage:localStorage,location,
 replaceURL:url=>history.replaceState(null,'',url),version:typeof WORLDLET_VERSION==='string'?WORLDLET_VERSION:'web',userAgent:navigator.userAgent,
 device:here,simple:new URLSearchParams(location.search).has('simple'),
 openWorld:url=>{
  const pressed=!mounting;
  void worldAnswers((input,init)=>fetch(input,init),url).then(ok=>{
   if(ok)location.replace(url);
   else if(pressed)alert('The full World is not available here yet. Update Worldlet on your computer, then try again.');
   else mount();
  });
 }});
mount(device);mounting=false;
