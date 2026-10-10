import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {WorldletError} from '../../files.ts';
import type {LocalHarnessInstall} from './local-harness.ts';

// Signing in to a provider happens in the person's own Agent (core/agent/model-providers.ts): its own sign-in command
// opens in their Terminal (macOS `.command`, Windows `.cmd`), where they answer it as they would by hand. Worldlet
// never sees what they type; it only learns afterwards which providers the Agent lists.

const quoteUnix=(value:string)=>`'${value.replace(/'/g,`'\\''`)}'`;
const quoteWindows=(value:string)=>`"${value.replace(/"/g,'""')}"`;
/** The script that runs `install`'s own `args` in a Terminal window and keeps it open. */
export function signInScript(platform:NodeJS.Platform,install:Pick<LocalHarnessInstall,'command'|'prefix'|'title'>,args:string[]):{extension:string;text:string} {
 const words=[install.command,...install.prefix,...args];
 if(platform==='win32')return {extension:'.cmd',text:`@echo off\r\n${words.map(quoteWindows).join(' ')}\r\necho.\r\necho When it says you are signed in, close this window and go back to Worldlet.\r\npause\r\n`};
 return {extension:'.command',text:`#!/bin/sh\n${words.map(quoteUnix).join(' ')}\necho\necho 'When it says you are signed in, close this window and go back to Worldlet.'\n`};
}
/** Writes the script beside the system's temporary files and opens it; it removes nothing the person needs. */
export async function openSignIn(install:LocalHarnessInstall,args:string[],open:(file:string)=>Promise<string>,platform=process.platform):Promise<void> {
 const script=signInScript(platform,install,args);
 const file=path.join(os.tmpdir(),`worldlet-sign-in-${crypto.randomUUID().slice(0,8)}${script.extension}`);
 fs.writeFileSync(file,script.text,{mode:0o700});
 const failure=await open(file);
 if(failure)throw new WorldletError(`Could not open Terminal: ${failure}`);
}
