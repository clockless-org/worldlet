/** The code a service gives while it signs in on its own page (GitHub's device code, contracts/platform.ts
 * SIGN_IN_CODE_EVENT): shown large, with one button that copies it and opens the page to paste it on. Used by Settings ›
 * Connectors and by Connect anywhere else in the World (ui/shell/world-onboarding.ts). */
import {SIGN_IN_CODE_EVENT,signInCode,type SignInCode} from '../../contracts/platform.ts';
import {GITHUB_INSTALL_URL} from '../../context/sources/index.ts';
import {agentButton as button,agentEl as el} from './agent-change.ts';

type Call=(action:string,body?:any)=>Promise<any>;
/** Opens a page in the system browser (the host's `openSystemBrowser`), or in a new tab where the World is a web page. */
export async function openPage(call:Call,url:string){
 try{await call('openSystemBrowser',{url});}
 catch{if(!window.open(url,'_blank','noopener'))throw Error('Could not open your browser. Try again.');}
}
/** Copies the code, then opens its page. Answers what to say. */
export async function copyAndOpen(call:Call,code:SignInCode):Promise<string> {
 let copied=true;
 try{await navigator.clipboard.writeText(code.code);}catch{copied=false;}
 await openPage(call,code.url);
 return copied?`Copied ${code.code}. Paste it on the page that opened and choose Authorize.`:`Type ${code.code} on the page that opened and choose Authorize.`;
}
/** Waits for the code of `provider`'s sign-in; `seen` gets each one. Answers the function that stops listening. */
export function listenForSignInCode(provider:string,seen:(code:SignInCode)=>void):()=>void {
 const on=(event:Event)=>{const code=signInCode((event as CustomEvent).detail);if(code&&code.provider===provider)seen(code);};
 window.addEventListener(SIGN_IN_CODE_EVENT,on);
 return ()=>window.removeEventListener(SIGN_IN_CODE_EVENT,on);
}
/** The code box: the code in large type and "Copy and open GitHub". */
export function signInCodeBox(call:Call,code:SignInCode,name:string,said:(text:string)=>void):HTMLElement {
 const box=el('div','companion-settings-sign-in-code');box.dataset.signInCode=code.provider;
 const shown=el('strong','companion-settings-sign-in-code-value',code.code);shown.setAttribute('aria-label',`Your ${name} code: ${code.code.split('').join(' ')}`);
 box.append(el('span','',`Your code for ${name}:`),shown,
  button(`Copy and open ${name}`,'copy-open-code',async()=>{try{said(await copyAndOpen(call,code));}catch(e){said((e as Error).message);}},true));
 return box;
}
/** "Choose projects": GitHub's own page where the person picks which repositories Worldlet may see. */
export function chooseProjectsButton(call:Call,said:(text:string)=>void):HTMLElement {
 return button('Choose projects','choose-projects',async()=>{
  try{await openPage(call,GITHUB_INSTALL_URL);said('Choose which projects Worldlet may see on GitHub\'s page, then come back here.');}
  catch(e){said((e as Error).message);}
 });
}
