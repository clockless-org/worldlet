// Saved sign-ins for the built-in browser (owner request 2026-10-07: "好像也没有内置的保存账号/密码的功能",
// his Pokémon Showdown sign-in was gone). Chrome's own password manager and autofill are drawn by its //chrome layer,
// which the windowless CEF panel does not draw, so the World keeps sign-ins itself: after the person signs in on a
// site the account is saved without asking (owner 2026-10-08: "password 不用问 自动存") and a short notice says so;
// on that site's sign-in form the panel offers to fill it in, one click.
// The page side (platform/bridge/login-watch.js) only reports; these rules decide. The host keeps each password
// encrypted with the system keychain (Electron safeStorage); the password never reaches the World UI, Fox or the
// recordings, and account sign-in hosts (Google, Apple; rules.ts SIGN_IN_HOSTS) are never inspected.

export const SAVED_LOGINS=Object.freeze({
 /** Accounts kept in all; the least recently used goes first. */
 maxLogins:500,
 maxUsername:200,
 maxPassword:1000,
 /** How long a username typed on its own step (an email page before the password page) stays the account for the next password. */
 usernameMs:5*60_000,
});

export type SavedLogin={site:string;username:string;createdAt:number;usedAt:number};
export type LoginSignal=
 |{kind:'form';url:string}
 |{kind:'username';url:string;value:string}
 |{kind:'login';url:string;username:string;password:string};

/** The site a sign-in is kept under: the page's https hostname, lower case, without a leading `www.`; '' for anything else. */
export function loginSite(url:unknown):string {
 try{
  const parsed=new URL(String(url??''));
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)return '';
  const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
  return host.startsWith('www.')?host.slice(4):host;
 }catch{return '';}
}

const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max?value:'';

/** What the page script reported, or null when it is not one of its messages. Usernames are trimmed; passwords are kept exactly. */
export function readLoginSignal(value:unknown):LoginSignal|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>,url=text(row.url,4000);
 if(!loginSite(url))return null;
 if(row.kind==='form')return {kind:'form',url};
 if(row.kind==='username'){const name=text(row.value,SAVED_LOGINS.maxUsername).trim();return name?{kind:'username',url,value:name}:null;}
 if(row.kind==='login'){
  const password=text(row.password,SAVED_LOGINS.maxPassword);if(!password)return null;
  return {kind:'login',url,username:text(row.username,SAVED_LOGINS.maxUsername).trim(),password};
 }
 return null;
}

/** The account a password was typed for: the username beside it, else one typed on this site a moment before (its own step). */
export function loginUsername(signal:{url:string;username:string},recent:{site:string;value:string;at:number}|null,now:number):string {
 if(signal.username)return signal.username;
 return recent&&recent.site===loginSite(signal.url)&&now-recent.at<=SAVED_LOGINS.usernameMs?recent.value:'';
}

/**
 * What to do after a sign-in: `save` a new account, `update` a saved account whose password changed, or `none`
 * (the same password is already saved, the site is on the never list, or there is no site).
 * `samePassword` compares with what is saved for that account (the host decrypts; this rule never sees two passwords).
 */
export function loginOffer({site,username,saved,never,samePassword}:{site:string;username:string;saved:SavedLogin[];never:string[];samePassword:boolean}):'save'|'update'|'none' {
 if(!site||never.includes(site))return 'none';
 const kept=saved.find(login=>login.site===site&&login.username===username);
 if(!kept)return 'save';
 return samePassword?'none':'update';
}

/** The accounts to offer on a site's sign-in form, the most recently used first. */
export function loginsFor(site:string,saved:SavedLogin[]):SavedLogin[] {
 if(!site)return [];
 return saved.filter(login=>login.site===site).sort((a,b)=>b.usedAt-a.usedAt);
}

/** Saved accounts beyond `maxLogins`, the least recently used first: the ones to drop when one more is saved. */
export function loginsOverLimit(saved:SavedLogin[]):SavedLogin[] {
 const extra=saved.length-SAVED_LOGINS.maxLogins;
 return extra>0?[...saved].sort((a,b)=>a.usedAt-b.usedAt).slice(0,extra):[];
}

/** The words of the notice after a sign-in was saved, kept with the rules so the panel and its checks agree. */
export function loginSavedText(kind:'save'|'update',site:string,username:string):string {
 const who=username?username+' on '+site:site;
 return kind==='update'?'Password updated for '+who:'Password saved for '+who;
}
export function loginFillText(username:string):string {return username?'Fill in '+username:'Fill in saved password';}
