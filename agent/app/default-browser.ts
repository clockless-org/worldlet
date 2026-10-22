/** Worldlet as the default browser: an opt-in setting, off until a person turns it on. Pure, so the host and the
 * fixture check share one mapping. Links from other apps open in the World (their own website Applet, else the
 * Browser); the links Worldlet itself hands to "your browser" go to the browser that was the default before. */
export type DefaultBrowserStatus='on'|'off'|'unsupported';

/** Only a packaged Mac or Windows build registers. A Dev build and a Microsoft Store package never touch the
 * system's link handlers (a Store package's own registry writes are virtualised away). */
export function defaultBrowserSupported({channel,platform,windowsStore}:{channel:string,platform:string,windowsStore?:boolean}){
 return channel==='release'&&(platform==='darwin'||platform==='win32'&&!windowsStore);
}

/** Where a link another app opened goes: an https page into the World; anything else the World's browser does not
 * load (http, a local server, a link with a password in it) to the previous browser; not a web link, nowhere. */
export function incomingLink(value:unknown):{to:'world'|'previous',url:string}|null {
 let url:URL;try{url=new URL(String(value??''));}catch{return null;}
 if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
 return {to:url.protocol==='https:'&&!url.username&&!url.password?'world':'previous',url:url.href};
}

/** The web links in a launch's arguments: Windows starts Worldlet, or hands a running copy, `Worldlet.exe <url>`. */
export function linksInArguments(argv:readonly string[]){return argv.slice(1).filter(arg=>/^https?:\/\//i.test(arg));}

/** The setting's words for each status; turning it on or off finishes where the system keeps the choice. */
export function defaultBrowserText(status:DefaultBrowserStatus|undefined,platform?:string){
 if(status==='on')return 'Links you click in other apps open in Worldlet, in their own Thing when you have one. Pages Worldlet sends to your browser still open in your previous browser.';
 if(status==='off')return platform==='win32'
  ?'Links from other apps open in your usual browser. Turn this on, then choose Worldlet in Windows Settings.'
  :'Links from other apps open in your usual browser. Turn this on and your Mac asks once to confirm.';
 return 'Using Worldlet as your default browser is available only in the installed Worldlet app.';
}
