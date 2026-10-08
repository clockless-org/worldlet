/** Self-contained: serialized into the built-in browser's isolated world by the resource builder.
 * Reports what happens on a website page to the host recorder (core/browser/web-record.ts): the
 * page's whole text as it changes, what the person typed (never passwords, card numbers or codes),
 * what they clicked and the address as it changes inside the page; a page showing a password, card
 * or one-time-code field is reported private instead. */
export function installWebRecorder() {
 const key='__worldletWebRecordV1';
 if(window[key])return;
 const send=value=>{try{if(typeof worldletRecord==='function')worldletRecord(JSON.stringify(value));}catch{}};
 // The same rule as core/browser/web-record.ts SECRET_NAME and secretField (web-record-check holds them equal).
 const SECRET_NAME=/^pass(word|wd|code|phrase)?$|password|passwd|pwd|passcode|secret|token|^auth$|authorization|^session(.?(id|key|token))?$|^sid$|cookie|credential|api.?key|card.?(number|no|num)|cc.?(num|number)|^cvv|^cvc|^csc|^cvn|(^|[^a-z])t?otp|otp$|mfa|2fa|one.?time|^code$|(sms|auth|verify|confirm|access|login|security|email|phone).?code|verification|^pin$|ssn|social.?security|iban|routing.?number|account.?number|signature|assertion|jwt|bearer|^refresh$|nonce|csrf|xsrf/i;
 const FIELD_HINT=/\bpassword\b|^cc-|one-time-code|current-password|new-password/i;
 const secretHint=hint=>typeof hint==='string'&&!!hint.trim()&&(FIELD_HINT.test(hint)||[hint.trim(),...hint.split(/[^A-Za-z0-9]+/)].some(word=>!!word&&SECRET_NAME.test(word)));
 const secret=t=>{
  const field=t.closest?.('input,textarea,select,[contenteditable]');if(!field)return true;
  if(field.closest('[data-history-private]'))return true;
  const type=(field.getAttribute('type')||'').toLowerCase(),max=Number(field.getAttribute('maxlength'));
  // A short numeric field is a one-time code.
  if(type==='password'||type==='hidden'||field.getAttribute('inputmode')==='numeric'&&max>0&&max<=8)return true;
  return [type,field.getAttribute('autocomplete'),field.getAttribute('name'),field.id,field.getAttribute('aria-label'),field.getAttribute('placeholder'),field.labels?.[0]?.innerText].some(secretHint);
 };
 // A page that shows a password, card or one-time-code field (also a sign-in dialog added later) is
 // private: the host keeps nothing more from it until the address changes.
 const PRIVATE_FIELDS='input[type=password],[autocomplete~=one-time-code],[autocomplete~=cc-number],[autocomplete~=cc-csc],[autocomplete~=current-password],[autocomplete~=new-password]';
 let hidden=false;
 const checkPrivate=()=>{
  if(hidden)return true;
  try{if(!document.querySelector(PRIVATE_FIELDS))return false;}catch{return false;}
  hidden=true;send({kind:'private',url:location.href});return true;
 };
 const label=field=>{
  const named=field.getAttribute('aria-label')||field.getAttribute('placeholder')||field.getAttribute('name')||field.id||'';
  const own=field.labels?.[0]?.innerText||'';
  return (own||named||field.tagName.toLowerCase()).trim().slice(0,120);
 };
 const valueOf=field=>(typeof field.value==='string'?field.value:field.innerText||'').slice(0,4000);
 // Text: whole-page snapshots at most once a minute, and lines that are new in between.
 let lastLines=new Set(),lastFull=0,lastText='',timer=0,address=location.href;
 const pageText=()=>{try{return (document.body?.innerText||'').slice(0,1000000);}catch{return '';}};
 const snap=()=>{
  timer=0;
  if(checkPrivate())return;
  const text=pageText();if(text===lastText)return;
  const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);
  const now=Date.now();
  if(!lastFull||now-lastFull>60000){
   send({kind:'text',url:location.href,title:document.title,text});lastFull=now;
  }else{
   const added=lines.filter(line=>!lastLines.has(line));
   if(added.length)send({kind:'text-more',url:location.href,title:document.title,text:added.join('\n')});
  }
  lastText=text;lastLines=new Set(lines);
 };
 const schedule=()=>{if(!timer)timer=setTimeout(snap,2000);};
 new MutationObserver(()=>{if(!checkPrivate())schedule();}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 // The address changes inside single-page sites without a load the host sees.
 setInterval(()=>{if(location.href!==address){address=location.href;lastFull=0;hidden=false;const shut=checkPrivate();send({kind:'page',url:address,title:document.title});if(!shut)schedule();}},1000);
 const typed=new WeakMap();
 const typedValue=field=>{
  if(!field||checkPrivate()||secret(field))return;
  const value=valueOf(field);if(!value.trim()||typed.get(field)===value)return;
  typed.set(field,value);send({kind:'input',url:location.href,field:label(field),value});
 };
 document.addEventListener('change',event=>{if(event.isTrusted)typedValue(event.target);},{capture:true,passive:true});
 document.addEventListener('focusout',event=>{if(event.isTrusted&&event.target?.matches?.('input,textarea,[contenteditable]'))typedValue(event.target);},{capture:true,passive:true});
 document.addEventListener('keydown',event=>{if(event.isTrusted&&event.key==='Enter'&&!event.isComposing&&event.target?.matches?.('input,textarea,[contenteditable]'))typedValue(event.target);},{capture:true,passive:true});
 document.addEventListener('click',event=>{
  if(!event.isTrusted||!(event.target instanceof Element)||checkPrivate())return;
  const target=event.target.closest('a,button,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],label,summary,input[type=submit],input[type=button]')||event.target;
  if(target.closest('input:not([type=submit]):not([type=button]),textarea,[contenteditable]'))return;
  const text=(target.getAttribute('aria-label')||target.innerText||target.value||target.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,200);
  const link=target.closest('a')?.href||'';
  send({kind:'click',url:location.href,label:text,href:link});
 },{capture:true,passive:true});
 document.addEventListener('submit',event=>{
  if(!event.isTrusted||!(event.target instanceof HTMLFormElement)||checkPrivate())return;
  const fields=[...event.target.elements].filter(field=>field.name&&!secret(field)&&field.type!=='submit'&&!((field.type==='radio'||field.type==='checkbox')&&!field.checked)).slice(0,40).map(field=>label(field)+': '+valueOf(field).slice(0,500));
  send({kind:'submit',url:location.href,fields});
 },{capture:true,passive:true});
 window[key]=true;
 const shut=checkPrivate();
 send({kind:'page',url:location.href,title:document.title});
 if(!shut)schedule();
}
