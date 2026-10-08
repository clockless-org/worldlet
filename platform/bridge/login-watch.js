/** Self-contained: serialized into the built-in browser's isolated world by the resource builder.
 * Saved sign-ins (core/browser/saved-logins.ts decides; owner request 2026-10-07): reports to the host that the
 * page shows a sign-in form, the account typed on its own step, and the account and password at the moment the
 * person signs in (a trusted submit, Enter or press on the sign-in button with a password typed). Fills a saved
 * account in when the host asks. It reads nothing else on the page and never runs on account sign-in hosts
 * (the host does not inspect those). */
export function installLoginWatch() {
 const key='__worldletLoginWatchV1';
 if(window[key])return;
 const send=value=>{try{if(typeof worldletLogin==='function')worldletLogin(JSON.stringify(value));}catch{}};
 const visible=field=>{try{const r=field.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(field).visibility!=='hidden';}catch{return false;}};
 // A one-time code is not a password: a short numeric field, or one the page marks as a code.
 const code=field=>{const max=Number(field.getAttribute('maxlength'));return /one-time-code/i.test(field.getAttribute('autocomplete')||'')||field.getAttribute('inputmode')==='numeric'&&max>0&&max<=8;};
 const passwords=()=>[...document.querySelectorAll('input[type=password]')].filter(field=>visible(field)&&!field.disabled&&!code(field));
 const NAME=/user|email|e-mail|login|account|identifier|phone|name|账号|用户|邮箱|手机/i;
 const textual=field=>field instanceof HTMLInputElement&&['text','email','tel',''].includes((field.getAttribute('type')||'').toLowerCase())&&visible(field)&&!field.disabled&&!field.readOnly;
 const nameLike=field=>textual(field)&&(/username|email/i.test(field.getAttribute('autocomplete')||'')||(field.getAttribute('type')||'').toLowerCase()==='email'||
  [field.getAttribute('name'),field.id,field.getAttribute('aria-label'),field.getAttribute('placeholder'),field.labels?.[0]?.innerText].some(hint=>typeof hint==='string'&&NAME.test(hint)));
 // The account field for a password: the last text field before it in its form (or the page), a name-like one first.
 const usernameFor=password=>{
  const scope=password?.form||document;
  const before=[...scope.querySelectorAll('input')].filter(field=>textual(field)&&(!password||field.compareDocumentPosition(password)&Node.DOCUMENT_POSITION_FOLLOWING));
  return before.filter(nameLike).at(-1)||before.at(-1)||null;
 };
 let reported='',formAt='';
 const signIn=()=>{
  const password=passwords().find(field=>field.value);if(!password)return;
  const username=(usernameFor(password)?.value||'').trim(),said=username+'\n'+password.value;
  if(said===reported)return;reported=said;
  send({kind:'login',url:location.href,username,password:password.value});
 };
 const BUTTON=/log\s*-?\s*in|sign\s*-?\s*in|continue|next|submit|enter|^ok$|登录|登入|继续|下一步|确定/i;
 document.addEventListener('submit',event=>{if(event.isTrusted&&event.target instanceof HTMLFormElement&&event.target.querySelector('input[type=password]'))signIn();},{capture:true,passive:true});
 document.addEventListener('keydown',event=>{
  if(!event.isTrusted||event.key!=='Enter'||event.isComposing)return;
  const field=event.target;
  if(field instanceof HTMLInputElement&&(field.type==='password'||textual(field)))signIn();
 },{capture:true,passive:true});
 document.addEventListener('click',event=>{
  if(!event.isTrusted||!(event.target instanceof Element))return;
  const button=event.target.closest('button,input[type=submit],[role=button]');if(!button)return;
  const words=(button.getAttribute('aria-label')||button.innerText||button.value||'').trim();
  // A button is a submit button by default, also outside any form (a show-password eye): only a form's counts by its type.
  if(button.type==='submit'&&button.form||BUTTON.test(words))signIn();
 },{capture:true,passive:true});
 // The account typed on its own step (an email page before the password page), kept by the host for a few minutes.
 document.addEventListener('focusout',event=>{
  const field=event.target;
  if(!event.isTrusted||!nameLike(field)||passwords().length||!field.value.trim())return;
  send({kind:'username',url:location.href,value:field.value.trim()});
 },{capture:true,passive:true});
 // A sign-in form on the page, said once per address (also a sign-in dialog added later).
 let timer=0;
 const look=()=>{timer=0;if(formAt===location.href)return;if(passwords().length){formAt=location.href;send({kind:'form',url:location.href});}};
 new MutationObserver(()=>{if(!timer)timer=setTimeout(look,500);}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['type','style','class','hidden']});
 // Fills a saved account in, as typing would: the page's own listeners see input and change.
 Object.defineProperty(window,'__worldletLoginFill',{value:(username,password)=>{
  const field=passwords()[0];if(!field&&!username)return {filled:false};
  const name=usernameFor(field)||(!field?[...document.querySelectorAll('input')].find(nameLike):null);
  const set=(input,value)=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
   input.focus();setter.call(input,value);
   input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  if(name&&username)set(name,username);
  if(field&&password)set(field,password);
  return {filled:!!(field&&password)||!!(name&&username)};
 }});
 window[key]=true;
 look();
}
