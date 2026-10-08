// Saved sign-ins (core/browser/saved-logins.ts, owner request 2026-10-07): the rules for what is offered, and the
// page watch (platform/bridge/login-watch.js) in a real Chromium page: a sign-in without a form (Pokémon Showdown's
// dialog), a form sent with Enter, an account typed on its own step, a one-time code that is no password, a sign-in
// dialog that appears later, and filling a saved account in as typing would.
import assert from 'node:assert/strict';
import {SAVED_LOGINS,loginFillText,loginOffer,loginSavedText,loginSite,loginUsername,loginsFor,loginsOverLimit,readLoginSignal,type SavedLogin} from '../core/browser/index.ts';
import {installLoginWatch} from '../platform/bridge/login-watch.js';
import {launchTestBrowser} from './browser-test.ts';

// Sites are kept by https hostname, without www.
assert.equal(loginSite('https://www.Example.com/login?next=1'),'example.com');
assert.equal(loginSite('https://play.pokemonshowdown.com/'),'play.pokemonshowdown.com');
for(const url of ['http://example.com/','https://user:pw@example.com/','about:blank','nope',null])assert.equal(loginSite(url),'',String(url));
// Only the watch's own messages count; passwords are kept exactly, usernames trimmed.
assert.deepEqual(readLoginSignal({kind:'login',url:'https://a.example/',username:' ash ',password:' pw '}),{kind:'login',url:'https://a.example/',username:'ash',password:' pw '});
assert.deepEqual(readLoginSignal({kind:'form',url:'https://a.example/'}),{kind:'form',url:'https://a.example/'});
assert.deepEqual(readLoginSignal({kind:'username',url:'https://a.example/',value:'ash@example.com'}),{kind:'username',url:'https://a.example/',value:'ash@example.com'});
for(const value of [null,[],{kind:'login',url:'https://a.example/',password:''},{kind:'login',url:'http://a.example/',password:'x'},{kind:'login',url:'https://a.example/',password:'x'.repeat(SAVED_LOGINS.maxPassword+1)},{kind:'username',url:'https://a.example/',value:'  '},{kind:'other',url:'https://a.example/'}])
 assert.equal(readLoginSignal(value),null,JSON.stringify(value)?.slice(0,80));
// The account of a password typed on its own page is the one typed on the site just before.
const now=1_000_000;
assert.equal(loginUsername({url:'https://a.example/pw',username:''},{site:'a.example',value:'ash',at:now-1000},now),'ash');
assert.equal(loginUsername({url:'https://a.example/pw',username:''},{site:'b.example',value:'ash',at:now-1000},now),'','another site\'s account is not this one\'s');
assert.equal(loginUsername({url:'https://a.example/pw',username:''},{site:'a.example',value:'ash',at:now-SAVED_LOGINS.usernameMs-1},now),'','too long ago');
assert.equal(loginUsername({url:'https://a.example/pw',username:'misty'},{site:'a.example',value:'ash',at:now},now),'misty','the field beside the password wins');
// Offers: a new account is saved, a changed password updated, the same one or a site said never offers nothing.
const saved:SavedLogin[]=[{site:'a.example',username:'ash',createdAt:1,usedAt:5},{site:'a.example',username:'misty',createdAt:1,usedAt:9},{site:'b.example',username:'ash',createdAt:1,usedAt:7}];
assert.equal(loginOffer({site:'a.example',username:'brock',saved,never:[],samePassword:false}),'save');
assert.equal(loginOffer({site:'a.example',username:'ash',saved,never:[],samePassword:false}),'update');
assert.equal(loginOffer({site:'a.example',username:'ash',saved,never:[],samePassword:true}),'none');
assert.equal(loginOffer({site:'c.example',username:'ash',saved,never:['c.example'],samePassword:false}),'none');
assert.equal(loginOffer({site:'',username:'ash',saved,never:[],samePassword:false}),'none');
assert.deepEqual(loginsFor('a.example',saved).map(l=>l.username),['misty','ash'],'the most recently used first');
assert.deepEqual(loginsFor('',saved),[]);
assert.deepEqual(loginsOverLimit(saved),[]);
const many=Array.from({length:SAVED_LOGINS.maxLogins+2},(_,i)=>({site:'s'+i+'.example',username:'u',createdAt:i,usedAt:i}));
assert.deepEqual(loginsOverLimit(many).map(l=>l.site),['s0.example','s1.example'],'the least recently used go first');
assert.equal(loginSavedText('save','a.example','ash'),'Password saved for ash on a.example');
assert.equal(loginSavedText('update','a.example',''),'Password updated for a.example');
assert.equal(loginFillText('ash'),'Fill in ash');
console.log('PASS saved sign-in rules: sites, page messages, accounts typed on their own step, saved/updated/never, order and limit.');

const PAGES:Record<string,string>={
 // Pokémon Showdown's sign-in: a dialog of plain fields and a button, no form.
 '/showdown':'<div class="ps-popup"><input name="username" placeholder="Username"><input type="password" name="password"><button class="button" id="go">Log in</button><button id="eye" aria-label="Show password">👁</button></div>',
 '/form':'<form id="f" onsubmit="event.preventDefault()"><label>Email <input type="email" id="email" autocomplete="username"></label><input type="password" id="pw" autocomplete="current-password"><input id="otp" autocomplete="one-time-code"></form>',
 '/step1':'<input type="email" id="email" name="identifier"><button id="next">Next</button>',
 '/step2':'<input type="password" id="pw"><input type="password" id="code" inputmode="numeric" maxlength="6"><button id="go">Sign in</button>',
 '/later':'<p>Members</p><script>setTimeout(()=>{document.body.insertAdjacentHTML("beforeend","<div><input id=user name=user><input type=password id=pw></div>");},300)</script>',
};
const browser=await launchTestBrowser();
try{
 const tab=await browser.newPage();
 await tab.route('https://login.example/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>'+(PAGES[new URL(route.request().url()).pathname]||'')+'</body>'}));
 const messages:any[]=[];
 await tab.exposeFunction('worldletLoginSent',(payload:string)=>{messages.push(JSON.parse(payload));});
 const open=async(page:string)=>{
  messages.length=0;
  await tab.goto('https://login.example'+page);
  await tab.evaluate(source=>{(window as any).worldletLogin=(payload:string)=>(window as any).worldletLoginSent(payload);(0,eval)('('+source+')()');},installLoginWatch.toString());
 };
 const sent=(kind:string)=>messages.filter(m=>m.kind===kind);
 const settle=()=>tab.waitForTimeout(700);

 await open('/showdown');await settle();
 assert.deepEqual(sent('form'),[{kind:'form',url:'https://login.example/showdown'}],'a sign-in form is said once');
 await tab.fill('[name=username]','AshK');await tab.fill('[name=password]','pikachu99');
 await tab.click('#eye');await settle();
 assert.deepEqual(sent('login'),[],'showing the password is no sign-in');
 await tab.click('#go');await settle();
 assert.deepEqual(sent('login'),[{kind:'login',url:'https://login.example/showdown',username:'AshK',password:'pikachu99'}],'Log in without a form is a sign-in');
 await tab.click('#go');await settle();
 assert.equal(sent('login').length,1,'the same sign-in is said once');
 // Filling a saved account in: the page's own listeners see it typed.
 await tab.fill('[name=username]','');await tab.fill('[name=password]','');
 await tab.evaluate(()=>{(window as any).heard=0;for(const f of document.querySelectorAll('input'))f.addEventListener('input',()=>(window as any).heard++);});
 assert.deepEqual(await tab.evaluate(()=>(window as any).__worldletLoginFill('AshK','pikachu99')),{filled:true});
 assert.deepEqual(await tab.evaluate(()=>[document.querySelector<HTMLInputElement>('[name=username]').value,document.querySelector<HTMLInputElement>('[name=password]').value,(window as any).heard]),['AshK','pikachu99',2]);

 await open('/form');await settle();
 await tab.fill('#email','ash@example.com');await tab.fill('#pw','s3cret');await tab.fill('#otp','123456');
 await tab.press('#pw','Enter');await settle();
 assert.deepEqual(sent('login'),[{kind:'login',url:'https://login.example/form',username:'ash@example.com',password:'s3cret'}],'Enter in a form signs in with the account beside the password');

 await open('/step1');await settle();
 assert.deepEqual(sent('form'),[],'an account step alone is no sign-in form');
 await tab.fill('#email','ash@example.com');await tab.click('#next');await settle();
 assert.deepEqual(sent('username'),[{kind:'username',url:'https://login.example/step1',value:'ash@example.com'}],'the account typed on its own step is said');
 await open('/step2');await settle();
 await tab.fill('#code','246810');await tab.click('#go');await settle();
 assert.deepEqual(sent('login'),[],'a one-time code is no password');
 await tab.fill('#pw','hunter2');await tab.click('#go');await settle();
 assert.deepEqual(sent('login'),[{kind:'login',url:'https://login.example/step2',username:'',password:'hunter2'}],'the host joins it to the account typed before');

 await open('/later');await tab.waitForTimeout(1200);
 assert.deepEqual(sent('form'),[{kind:'form',url:'https://login.example/later'}],'a sign-in dialog added later is said too');
 console.log('PASS the page watch: a sign-in without a form, Enter in a form, an account on its own step, codes kept out, a later dialog, and filling as typing would.');
}finally{await browser.close();}
