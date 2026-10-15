import {mountWebOpen} from './index.ts';

// The page's entry (open.html): Worldlet in this browser, against the relay that served the page.
declare const WORLDLET_VERSION:string;
/** Whether this browser can draw WebGL at all; the rest is what it says of its device. */
function webgl(){try{const canvas=document.createElement('canvas');return !!(canvas.getContext('webgl2')||canvas.getContext('webgl'));}catch{return false;}}
const device={webgl:webgl(),memory:(navigator as {deviceMemory?:number}).deviceMemory,cores:navigator.hardwareConcurrency||undefined,width:screen.width,height:screen.height,
 saveData:(navigator as {connection?:{saveData?:boolean}}).connection?.saveData===true};
mountWebOpen(document.getElementById('worldlet')!,{fetch:(input,init)=>fetch(input,init),storage:localStorage,location,
 replaceURL:url=>history.replaceState(null,'',url),version:typeof WORLDLET_VERSION==='string'?WORLDLET_VERSION:'web',userAgent:navigator.userAgent,
 device,openWorld:url=>location.replace(url),simple:new URLSearchParams(location.search).has('simple')});
