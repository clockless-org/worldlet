import {mountWebOpen} from './index.ts';

// The page's entry (open.html): Worldlet in this browser, against the relay that served the page.
declare const WORLDLET_VERSION:string;
mountWebOpen(document.getElementById('worldlet')!,{fetch:(input,init)=>fetch(input,init),storage:localStorage,location,
 replaceURL:url=>history.replaceState(null,'',url),version:typeof WORLDLET_VERSION==='string'?WORLDLET_VERSION:'web',userAgent:navigator.userAgent});
