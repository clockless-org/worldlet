// The Game Factory (owner request 2026-10-03): the person tells Fox what game they want, Fox's model
// writes it as one self-contained HTML file, and Worldlet checks it, tries it offline and keeps it in
// this World. These are the rules every host applies; the host stores files, runs the hidden trial
// and shows the game in its own sandboxed view (core/games/README.md).

/** Making games is not open yet (owner decision 2026-10-03: "先coming soon"): the Games area panel shows
 * Make a game as coming soon and Fox is not offered the tools. The rules and host engine below are ready. */
export const GAME_MAKING_OPEN=false;
/** The Applet whose task lane the engine runs in once making opens (the Factory itself is the Games landmark). */
export const GAME_FACTORY_APPLET='app-game-factory';
export const MADE_GAME_LIMITS={bytes:300_000,games:60,title:40,blurb:160,idea:2000,versions:3};
export interface MadeGame {
 id:string;title:string;blurb:string;color:string;
 /** The person's own words that asked for the game (and later changes), newest last. */
 ideas:string[];
 createdAt:number;updatedAt:number;version:number;best:number|null;
}
export type EnergySourceName='chatgpt'|'own'|'none';

const characters=(value:string)=>[...value];
const clip=(value:unknown,count:number)=>characters(typeof value==='string'?value.replace(/\s+/g,' ').trim():'').slice(0,count).join('');

/** Making a game takes many model tokens (owner decision 2026-10-03), so it runs on the person's own
 * energy: a ChatGPT plan or their own API key (Worldlet provides no model of its own, owner decision 2026-10-05). */
export function gameFactoryEnergy(source:EnergySourceName):{ok:true}|{ok:false;error:string} {
 if(source==='chatgpt'||source==='own')return {ok:true};
 return {ok:false,error:'Making a game uses a lot of energy, so it needs the person\'s own: their ChatGPT sign-in or their own API key (Anthropic or OpenAI) on the Energy page. Tell them in one or two short sentences and offer to open the Energy page (open_worldlet_controls with screen "model"). Playing games that are already made needs no energy.'};
}

/** A new game's ID: short, file-name safe and unique enough within one World. */
export function madeGameId(random:()=>number=Math.random):string {
 let id='game-';for(let i=0;i<10;i++)id+='abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(random()*32)];
 return id;
}
export const validMadeGameId=(value:unknown):value is string=>typeof value==='string'&&/^game-[a-z0-9]{10}$/.test(value);

/** The record kept beside a game's file, from the model's save and the previous record when it replaces one. */
export function madeGameRecord(input:{title?:unknown;blurb?:unknown;color?:unknown},{id,idea,now,previous}:{id:string;idea:string;now:number;previous?:MadeGame|null}):MadeGame {
 const title=clip(input.title,MADE_GAME_LIMITS.title)||previous?.title||'My game';
 const blurb=clip(input.blurb,MADE_GAME_LIMITS.blurb)||previous?.blurb||'';
 const color=typeof input.color==='string'&&/^#[0-9a-f]{6}$/i.test(input.color)?input.color.toLowerCase():previous?.color||'#c8553d';
 const ideas=[...(previous?.ideas??[]),clip(idea,MADE_GAME_LIMITS.idea)].filter(Boolean).slice(-8);
 return {id,title,blurb,color,ideas,createdAt:previous?.createdAt??now,updatedAt:now,version:(previous?.version??0)+1,best:previous?.best??null};
}
export function readMadeGame(value:unknown):MadeGame|null {
 if(!value||typeof value!=='object')return null;
 const row=value as Record<string,unknown>;
 if(!validMadeGameId(row.id)||typeof row.title!=='string'||typeof row.createdAt!=='number'||typeof row.updatedAt!=='number')return null;
 return {id:row.id,title:clip(row.title,MADE_GAME_LIMITS.title)||'My game',blurb:clip(row.blurb,MADE_GAME_LIMITS.blurb),
  color:typeof row.color==='string'&&/^#[0-9a-f]{6}$/i.test(row.color)?row.color:'#c8553d',
  ideas:Array.isArray(row.ideas)?row.ideas.filter((idea):idea is string=>typeof idea==='string').slice(-8):[],
  createdAt:row.createdAt,updatedAt:row.updatedAt,version:typeof row.version==='number'?row.version:1,
  best:typeof row.best==='number'&&Number.isFinite(row.best)?row.best:null};
}
/** Newest first: a game just made or changed leads the Games area. */
export const orderMadeGames=(games:MadeGame[])=>[...games].sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));

// Only SVG/XML namespace names may look like addresses; nothing is ever fetched from them.
const NAMESPACE=/^https?:\/\/www\.w3\.org\//i;
const FORBIDDEN:[RegExp,string][]=[
 [/\bfetch\s*\(/,'fetch()'],[/\bXMLHttpRequest\b/,'XMLHttpRequest'],[/\bWebSocket\b/,'WebSocket'],[/\bEventSource\b/,'EventSource'],
 [/\bsendBeacon\b/,'navigator.sendBeacon'],[/\bRTCPeerConnection\b/,'RTCPeerConnection'],[/\bimportScripts\b/,'importScripts'],
 [/\bimport\s*\(/,'dynamic import()'],[/^\s*import\s[^(]/m,'import statements'],[/\bwindow\.open\s*\(/,'window.open'],[/\bnew\s+Worker\b|\bSharedWorker\b|\bserviceWorker\b/,'workers'],
 [/<\s*(?:iframe|object|embed|link|base|form|frame)\b/i,'<iframe>, <object>, <embed>, <link>, <base>, <form> or <frame> elements'],
 [/\bdocument\.cookie\b/,'cookies'],[/\bindexedDB\b/,'indexedDB'],[/<\s*script[^>]*\bsrc\s*=/i,'external scripts'],
 [/<\s*meta[^>]*http-equiv\s*=\s*["']?refresh/i,'meta refresh'],[/(?<![\w$.])(?:window\.)?(?:top|parent|opener)\.(?:location|postMessage|document)\b|(?<![\w$])(?:window|document)\.location\s*=[^=]|\blocation\.(?:href\s*=[^=]|assign\s*\(|replace\s*\()/,'navigating away or reaching other windows'],
];
/** The static rules a sandboxed page Fox's model wrote must pass before it is tried (a made game, or a widget,
 * core/widgets): one self-contained page, small, and nothing that reaches the network or another document.
 * Problems are written for the model to fix. */
export function offlinePageProblems(html:unknown,{noun,bytes}:{noun:string;bytes:number}):string[] {
 const The='The '+noun;
 if(typeof html!=='string'||!html.trim())return [`${The} is empty. Send one complete HTML document.`];
 const problems:string[]=[];
 const size=new TextEncoder().encode(html).length;
 if(size>bytes)problems.push(`${The} is ${Math.round(size/1000)} KB; keep it under ${bytes/1000} KB.`);
 if(!/<\s*script\b/i.test(html))problems.push(`${The} has no <script>. Put all of its code in inline <script> elements.`);
 const urls=[...html.matchAll(/\b(?:https?|wss?|ftp):\/\/[^\s"'`<>)]+/gi)].map(match=>match[0]).filter(url=>!NAMESPACE.test(url));
 if(urls.length)problems.push(`${The} refers to addresses (${[...new Set(urls)].slice(0,3).join(', ')}). It runs offline: use no external files, fonts, images or links; draw with canvas, CSS, SVG or emoji.`);
 if(/\b(?:src|href)\s*=\s*["']?\s*\/\//i.test(html)||/url\(\s*["']?\s*\/\//i.test(html))problems.push(`${The} loads something from another site. It runs offline.`);
 for(const [pattern,name] of FORBIDDEN)if(pattern.test(html))problems.push(`Remove ${name}: the ${noun} runs offline in a sandbox where it is unavailable.`);
 return problems;
}
export const checkMadeGameSource=(html:unknown)=>offlinePageProblems(html,{noun:'game',bytes:MADE_GAME_LIMITS.bytes});

/** The trial's verdict from what the hidden run saw: script errors, a blank screen or a crash. */
export function madeGameTrialProblems(report:{errors?:unknown;distinctColors?:unknown;crashed?:unknown;loaded?:unknown},noun='game'):string[] {
 const The='The '+noun,problems:string[]=[];
 if(report.crashed===true)return [`${The} crashed the page while it was tried.`];
 if(report.loaded!==true)problems.push(`${The} did not finish loading within a few seconds.`);
 const errors=Array.isArray(report.errors)?report.errors.filter((e):e is string=>typeof e==='string').slice(0,5):[];
 for(const error of errors)problems.push('Script error while it ran: '+clip(error,300));
 if(typeof report.distinctColors==='number'&&report.distinctColors<3)problems.push(`${The} showed a blank screen. Draw it right away, without waiting for a click.`);
 return problems;
}

/** The Content Security Policy every made page (a made game or a Moment Applet) runs under, on top of the host's
 * blocked network: inline code and styles, pictures from data and blob only, and no connections, frames or forms. */
export const SANDBOX_POLICY="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
export const MADE_GAME_POLICY=SANDBOX_POLICY;
/** A made page with Worldlet's prelude (its policy and report channel) at the very start, after a leading doctype
 * (and any comments before it) when there is one, so none of the page's own markup or code comes before the policy.
 * The parser puts the prelude in the head it opens; the page's own <html> and <head> tags then join that one. A page
 * without a doctype gets one. */
export function sandboxDocument(html:string,prelude:string):string {
 const doctype=/^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
 return doctype?doctype[0]+prelude+html.slice(doctype[0].length):'<!doctype html>'+prelude+html;
}
/** Lines the game's page writes to the console for the host: its best score and any script error. */
export const MADE_GAME_REPORT='⁣worldlet-game:';
const prelude=()=>`<meta http-equiv="Content-Security-Policy" content="${MADE_GAME_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1"><script>(()=>{'use strict';
const report=value=>{try{console.log(${JSON.stringify(MADE_GAME_REPORT)}+JSON.stringify(value));}catch{}};
addEventListener('error',event=>report({error:String(event.message||'Error')+(event.lineno?' (line '+event.lineno+')':'')}));
addEventListener('unhandledrejection',event=>report({error:'Unhandled promise rejection: '+String(event.reason&&event.reason.message||event.reason)}));
const memory=()=>{const map=new Map();return {getItem:k=>map.has(String(k))?map.get(String(k)):null,setItem:(k,v)=>{map.set(String(k),String(v));},removeItem:k=>{map.delete(String(k));},clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};};
for(const name of ['localStorage','sessionStorage'])try{Object.defineProperty(window,name,{value:memory(),configurable:true});}catch{}
Object.defineProperty(window,'worldlet',{value:Object.freeze({best:score=>{if(typeof score==='number'&&Number.isFinite(score))report({best:score});}})});
})();</script>`;
/** The document the host loads: the model's page with the policy, the report channel and an in-memory
 * stand-in for local storage placed before any of its own code. */
export function madeGameDocument(html:string):string {
 return sandboxDocument(html,prelude());
}
/** One console line from the game's page, if it is one of ours. */
export function readMadeGameReport(line:unknown):{best?:number;error?:string}|null {
 if(typeof line!=='string'||!line.startsWith(MADE_GAME_REPORT)||line.length>2000)return null;
 try{
  const value=JSON.parse(line.slice(MADE_GAME_REPORT.length));
  if(typeof value?.best==='number'&&Number.isFinite(value.best)&&Math.abs(value.best)<1e12)return {best:value.best};
  if(typeof value?.error==='string')return {error:clip(value.error,300)};
 }catch{}
 return null;
}
/** A higher score is better unless the game says otherwise; the record keeps the best one seen. */
export const betterBest=(previous:number|null,score:number)=>previous===null||score>previous?score:previous;

/** What the Game Factory's task asks of Fox's model. The contract itself rides in save_game's description. */
export function madeGameTask(idea:string,previous?:MadeGame|null):string {
 const words=clip(idea,1200);
 const base=previous?`Change the game "${previous.title}" (${previous.id}) as the person asks: ${words}\nRead its current page with games/source, then send the whole changed page with games/save and replaces "${previous.id}".`
  :`Make a small game the person asked for: ${words}`;
 return base+'\nRead the games/save schema first and follow it exactly. If it reports problems, fix every one and save again. When it succeeds, tell the person in one short sentence that the game is ready to play in the Games area.';
}
