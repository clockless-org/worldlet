import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {hermesBorrowsCodex,hermesServerEnvLines,hermesServerSettings,hermesWorldTools,hermesWorldToolsCommand,hermesWorldToolsRegistered,type HermesWorldToolsServer} from '../../../../../core/agent/index.ts';
import {WorldletError,realPath} from '../../files.ts';
import type {GatewaySettings} from './harness-sessions.ts';

// Hermes Agent as a resident service (owner decision 2026-10-08, Kelvin: a person with no Agent gets Hermes Agent
// installed, and from then on, whether they installed it or Worldlet did, Fox reaches it by one path; Hermes is an
// always-online service on the computer, started at login and kept running after Worldlet quits, like a Telegram bot).
// For the Hermes Agent Fox uses, Worldlet makes its gateway a
// login service with Hermes' own `hermes gateway install` and starts it, with its API server on this computer only:
// a strong random API_SERVER_KEY (and API_SERVER_HOST=127.0.0.1) is appended to that profile's `.env` only when it has no
// usable key; the person's own key, port and host are read and used, never replaced. Worldlet never stops the service.
// The rules are Core's (core/agent/hermes-server.ts); Fox's turns reach the server through HermesServerConversation
// (harness-sessions.ts). Done once per profile and app run, in the background; a failure is recorded in diagnostics and
// Fox keeps its current path. The key is never logged or shown.

const read=(file:string)=>{try{const stat=fs.statSync(file);return stat.isFile()&&stat.size<=1_000_000?fs.readFileSync(file,'utf8'):'';}catch{return '';}};
/** A profile's API server as Fox reaches it: on this computer, its port and key from the profile's own files. */
export function hermesServer(home:string|null):GatewaySettings {
 const settings=home?hermesServerSettings(read(path.join(home,'config.yaml')),read(path.join(home,'.env'))):null;
 return {port:settings?.port??8642,secret:settings&&!settings.off?settings.key:null,responses:null,worldTools:home?hermesWorldToolsRegistered(read(path.join(home,'config.yaml'))):false};
}

export type HermesCommand=(args:string[],stdin?:string)=>Promise<{code:number|null;stderr:string}>;
const done=new Map<string,Promise<string|null>>();
/** Makes the profile at `home` a resident service through its own `hermes` (`command`): the key first, when it has none,
 * so the gateway starts with its API server on; then `hermes gateway install --start-now --start-on-login` (idempotent:
 * an installed service is kept, an outdated one repaired) and `hermes gateway start`, or `restart` when the key was just
 * added, so a gateway already running reads it. Resolves null when it is resident with its API server on, else why not
 * (a reason, not an error); rejects when Hermes' own command failed. Once per profile and app run. */
export function keepHermesResident(home:string,command:HermesCommand,{worldTools=null}:{worldTools?:((home:string)=>HermesWorldToolsServer)|null}={}):Promise<string|null> {
 // The real path only keys the once-per-profile run: the profile is set up at the path the caller names, so the
 // registered World tools entry names it as `worldTools` does elsewhere (a Mac temp folder is /var, really /private/var).
 const key=realPath(home);
 let work=done.get(key);
 if(!work){work=resident(home,command,worldTools);done.set(key,work);work.catch(()=>done.delete(key));}
 return work;
}
async function resident(home:string,command:HermesCommand,worldTools:((home:string)=>HermesWorldToolsServer)|null):Promise<string|null> {
 const config=read(path.join(home,'config.yaml')),envFile=path.join(home,'.env');
 if(!config.trim())return 'its profile has no settings yet';
 // A profile still set to Worldlet's earlier read-only Codex borrowing has no model a stock Hermes Agent can use.
 if(hermesBorrowsCodex(config))return 'its model is set to this computer’s Codex sign-in the way Worldlet’s own runtime used it; choose a model with hermes model';
 const settings=hermesServerSettings(config,read(envFile));
 let added=false;
 if(!settings.off&&!settings.key){
  let current='';try{current=fs.readFileSync(envFile,'utf8');}catch(error){if((error as NodeJS.ErrnoException)?.code!=='ENOENT')throw error;}
  fs.appendFileSync(envFile,(current&&!current.endsWith('\n')?'\n':'')+hermesServerEnvLines(crypto.randomBytes(32).toString('hex')),{mode:0o600});
  added=true;
 }
 const run=async(args:string[],stdin?:string)=>{
  const result=await command(args,stdin);
  if(result.code!==0)throw new WorldletError(`hermes ${args.slice(0,2).join(' ')} did not finish: ${(result.stderr.trim().split('\n').filter(Boolean).pop()||(result.code===null?'it did not answer in time':'it stopped with code '+result.code)).slice(0,300)}`);
 };
 // World tools on Hermes (owner decision 2026-10-08 19:15Z): Worldlet's `worldlet` MCP server in this profile, through
 // Hermes' own `hermes mcp add` (it connects to the standing endpoint first and saves only that entry), before the gateway
 // starts so it loads it; restarted when it changed. A server of the person's by that name, or Worldlet's turned off, is left.
 let registered=false;
 if(worldTools){
  const server=worldTools(home),state=hermesWorldTools(config,server),change=hermesWorldToolsCommand(server,state);
  if(change){
   await run(change.args,change.stdin);
   if(hermesWorldTools(read(path.join(home,'config.yaml')),server)!=='current')throw new WorldletError('hermes mcp add did not save Worldlet’s World tools');
   registered=true;
  }
 }
 await run(['gateway','install','--start-now','--start-on-login']);
 await run(['gateway',added||registered?'restart':'start']);
 return settings.off?'its API server is turned off (platforms.api_server.enabled: false in config.yaml)':null;
}
