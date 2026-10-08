/** Self-contained: serialized into the main world of every document on Electron's own views by the resource builder.
 * Passkeys (WebAuthn) work on the CEF engine, whose Chromium draws the passkey and phone (QR) dialogs; Electron's
 * views have no such dialogs, so a passkey sign-in there fails (owner report 2026-10-08: LinkedIn). This reports a
 * passkey request to the host, which reopens the page on the engine; the request itself goes on unchanged. */
export function installPasskeyWatch() {
 const credentials=navigator.credentials;
 if(!credentials||window.__worldletPasskeyWatch)return;
 Object.defineProperty(window,'__worldletPasskeyWatch',{value:true});
 const report=(kind,options)=>{
  if(!options||!options.publicKey)return;
  try{if(typeof worldletPasskey==='function')worldletPasskey(JSON.stringify({kind,conditional:options.mediation==='conditional'}));}catch{}
 };
 for(const kind of ['get','create']){
  const original=credentials[kind];if(typeof original!=='function')continue;
  credentials[kind]=function(options){report(kind,options);return original.call(this,options);};
 }
}
