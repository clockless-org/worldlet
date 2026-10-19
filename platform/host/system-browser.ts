import {app,shell} from 'electron';

/** Links the system hands Worldlet as the default browser, and the pages Worldlet itself sends to "your browser".
 * The default-browser setting (modules/shell/default-browser.ts) receives the first and routes the second. */
let receiver:((url:string)=>void)|null=null;
let handOff:((url:string)=>Promise<boolean>)|null=null;
const early:string[]=[];

/** macOS delivers the link that launched Worldlet before `ready`, so this listens from the first line of main. */
export function listenForLinks(){
 app.on('open-url',(event,url)=>{event.preventDefault();if(receiver)receiver(url);else early.push(url);});
}
/** The setting takes links from here on, the ones that arrived while Worldlet was starting first. */
export function receiveLinks(next:(url:string)=>void){receiver=next;for(const url of early.splice(0))next(url);}
/** While Worldlet is the default browser, "your browser" means the one that was the default before it. */
export function handOffLinks(next:(url:string)=>Promise<boolean>){handOff=next;}

/** Open a web page in the person's browser, never back in Worldlet. */
export async function openInBrowser(url:string){
 if(handOff&&/^https?:/i.test(url)&&await handOff(url).catch(()=>false))return;
 await shell.openExternal(url);
}
