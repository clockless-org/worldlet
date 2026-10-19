import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {WorldletError} from '../../files.ts';
import {spawn} from 'node:child_process';
import {CLAUDE_CODE_STATUS,claudeCodeLoggedIn,providerSignIn} from '../../../../agent/gate/index.ts';
import {stopChild} from './protocol.ts';
import type {LocalHarnessInstall} from './local-harness.ts';

// Signing in to a provider happens in the person's own Agent (agent/gate/model-providers.ts): its own sign-in command
// opens in their Terminal (macOS `.command`, Windows `.cmd`), where they answer it as they would by hand. Worldlet
// never sees what they type; it only learns afterwards which providers the Agent lists.

const quoteUnix=(value:string)=>`'${value.replace(/'/g,`'\\''`)}'`;
const quoteWindows=(value:string)=>`"${value.replace(/"/g,'""')}"`;
const SIGNED_IN='When it says you are signed in, close this window and go back to Worldlet.';
/** What an update's window says when the Agent's own update command is done (agent/gate/agent-versions.ts). */
export const UPDATED='When it has finished updating, close this window and go back to Worldlet.';
/** The script that runs `install`'s own `args` in a Terminal window and keeps it open, `after` its last line (plain
 * words: it is echoed unquoted on Windows). */
export function signInScript(platform:NodeJS.Platform,install:Pick<LocalHarnessInstall,'command'|'prefix'|'title'>,args:string[],after=SIGNED_IN):{extension:string;text:string} {
 const words=[install.command,...install.prefix,...args];
 if(platform==='win32')return {extension:'.cmd',text:`@echo off\r\n${words.map(quoteWindows).join(' ')}\r\necho.\r\necho ${after}\r\npause\r\n`};
 return {extension:'.command',text:`#!/bin/sh\n${words.map(quoteUnix).join(' ')}\necho\necho ${quoteUnix(after)}\n`};
}
/** Writes the script beside the system's temporary files and opens it; it removes nothing the person needs. */
export async function openSignIn(install:Pick<LocalHarnessInstall,'command'|'prefix'|'title'>,args:string[],open:(file:string)=>Promise<string>,platform=process.platform,after=SIGNED_IN):Promise<void> {
 const script=signInScript(platform,install,args,after);
 const file=path.join(os.tmpdir(),`worldlet-sign-in-${crypto.randomUUID().slice(0,8)}${script.extension}`);
 fs.writeFileSync(file,script.text,{mode:0o700});
 const failure=await open(file);
 if(failure)throw new WorldletError(`Could not open Terminal: ${failure}`);
}

/** An Agent that signs in on its own in the browser (`BACKGROUND_SIGN_IN`, agent/gate/model-providers.ts): Worldlet runs
 * its sign-in command itself, with no window, and waits until it ends (the person approved it in their browser), is
 * cancelled (`signal`) or ten minutes pass. Its output is not kept: the Agent keeps its own sign-in, Worldlet sees none. */
export function signInInBackground(install:LocalHarnessInstall,args:string[],env:Record<string,string>,signal:AbortSignal,timeoutMs=600_000):Promise<void> {
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new WorldletError('Sign-in was cancelled.'));return;}
  const child=spawn(install.command,[...install.prefix,...args],{env,stdio:['pipe','ignore','ignore'],windowsHide:true});
  let done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);if(error){stopChild(child);reject(error);}else resolve();};
  const cancel=()=>finish(new WorldletError('Sign-in was cancelled.'));
  const timer=setTimeout(()=>finish(new WorldletError(`${install.title} was not signed in. Try again, and approve it in your browser.`)),timeoutMs);
  signal.addEventListener('abort',cancel);
  child.once('error',error=>finish(new WorldletError(`${install.title} could not start its sign-in: ${error.message}`)));
  child.once('exit',code=>finish(code===0?undefined:new WorldletError(`${install.title} was not signed in. Try again, and approve it in your browser.`)));
 });
}
/** Whether Claude Code is signed in (`claude auth status --json`); null when it cannot say. */
export function claudeCodeSignedIn(install:LocalHarnessInstall,env:Record<string,string>,timeoutMs=10_000):Promise<boolean|null> {
 return new Promise(resolve=>{
  let output='';
  let child;
  try{child=spawn(install.command,[...install.prefix,...CLAUDE_CODE_STATUS],{env,stdio:['ignore','pipe','ignore'],windowsHide:true});}catch{resolve(null);return;}
  const timer=setTimeout(()=>{stopChild(child);resolve(null);},timeoutMs);
  child.stdout!.on('data',(chunk:Buffer)=>{output=(output+chunk.toString('utf8')).slice(-20000);});
  child.once('error',()=>{clearTimeout(timer);resolve(null);});
  child.once('exit',()=>{clearTimeout(timer);resolve(claudeCodeLoggedIn(output));});
 });
}

// One sign-in at a time: the page Worldlet opened by itself and the person's Sign in button share it, so the browser
// never gets two sign-in pages.
let running:Promise<void>|null=null,triedThisLaunch=false;
export function backgroundSignIn(install:LocalHarnessInstall,args:string[],env:Record<string,string>,signal:AbortSignal):Promise<void> {
 if(running)return running;
 const current=running=signInInBackground(install,args,env,signal).finally(()=>{if(running===current)running=null;});
 return current;
}
/** Claude Code's sign-in ran out (a setup check, Fox's turn or background work said so): Worldlet opens its own
 * sign-in page in the browser by itself, at most once per launch, so a page the person closed never comes back on its
 * own (owner decision 2026-10-11). The Sign in buttons in setup and in Settings, Agent stay for another try. */
export function signInOnce(install:LocalHarnessInstall,env:Record<string,string>):boolean {
 const args=providerSignIn(install.id,'anthropic');
 if(install.id!=='claude-code'||!args||triedThisLaunch||running)return false;
 triedThisLaunch=true;
 void backgroundSignIn(install,args,env,new AbortController().signal).catch(()=>{});
 return true;
}
