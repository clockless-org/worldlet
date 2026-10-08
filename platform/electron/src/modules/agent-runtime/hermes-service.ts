import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {hermesBorrowsCodex,hermesServerEnvLines,hermesServerSettings,hermesWorldTools,hermesWorldToolsCommand,hermesWorldToolsRegistered,type HermesWorldToolsServer} from '../../../../../core/agent/index.ts';
import {WorldletError,realPath} from '../../files.ts';
import type {GatewaySettings} from './harness-sessions.ts';
import type {AgentEventHandler,AgentRuntime,Row} from './types.ts';

// Hermes Agent as a resident service (owner decision 2026-10-08, Kelvin: a person with no Agent gets Hermes Agent
// installed, and from then on, whether they installed it or Worldlet did, Fox reaches it by one path; Hermes is an
// always-online service on the computer, started at login and kept running after Worldlet quits, like a Telegram bot).
// For whichever Hermes Agent Fox uses (the standard one Worldlet set up, or the person's own), Worldlet makes its gateway a
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
/** Worldlet's own runtime for the standard Hermes Agent: its venv `python` and `hermes_command.py` (`launcher`). */
export type HermesRuntime={python:string;launcher:string};

// The service runs `python -m hermes_cli.main gateway run` (Hermes' launchd, systemd and Windows launchers all build it
// from the venv's python), not hermes_command.py, so the read-only Codex borrow would be skipped and a single-use Codex
// refresh token could be refreshed there, signing the Codex app out. Worldlet writes a hook into its own runtime's
// site-packages (never a person's own Python), run by Python at start: for `-m hermes_cli.main` naming no other profile,
// when Worldlet's profile is set to this computer's Codex sign-in, it loads hermes_command.py and borrows exactly as it
// does (borrow_codex_for: only when Hermes' home is that profile). If that borrow fails the process stops rather than
// run unborrowed. Rewritten when Worldlet's files move (an update), inert for every other process.
const HOOK='worldlet_codex_borrow';
export function hermesCodexBorrowHook(launcher:string,profile:string):string {
 return `# Written by Worldlet: Hermes run as \`python -m hermes_cli.main\` on Worldlet's runtime (its resident gateway)
# borrows this computer's Codex sign-in read-only, as hermes_command.py does. Inert for every other process.
def _borrow(launcher, profile):
    import os, sys
    argv = list(getattr(sys, 'orig_argv', None) or ())
    rest = argv[argv.index('-m') + 1:] if '-m' in argv else []
    if rest[:1] != ['hermes_cli.main']:
        return
    for arg in rest[1:]:
        if not arg.startswith('-'):
            break
        if arg in ('-p', '--profile') or arg.startswith('--profile='):
            return
    try:
        with open(os.path.join(profile, 'config.yaml'), encoding='utf-8') as file:
            if 'local-codex' not in file.read():
                return
    except OSError:
        return
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('hermes_command', launcher)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.borrow_codex_for(profile)
    except BaseException as error:
        sys.stderr.write('Worldlet could not borrow the Codex sign-in read-only (%s); Hermes stops instead. Open Worldlet to repair it.\\n' % type(error).__name__)
        sys.stderr.flush()
        os._exit(78)


_borrow(${JSON.stringify(launcher)}, ${JSON.stringify(profile)})
`;
}
/** The site-packages of the venv whose python is `python`: lib/python3.N/site-packages, or Lib/site-packages on Windows. */
export function venvSitePackages(python:string):string[] {
 const venv=path.dirname(path.dirname(python)),lib=path.join(venv,'lib');
 let found:string[]=[];
 try{found=fs.readdirSync(lib).filter(name=>/^python3\.\d+$/.test(name)).map(name=>path.join(lib,name,'site-packages'));}catch{}
 return [...found,path.join(venv,'Lib','site-packages')].filter(dir=>{try{return fs.statSync(dir).isDirectory();}catch{return false;}});
}
/** Writes the hook into `runtime`'s venv for the profile at `home`; true when it changed (a running gateway lacks it). */
function keepCodexBorrow({python,launcher}:HermesRuntime,home:string):boolean {
 const sites=venvSitePackages(python);
 if(!sites.length)throw new WorldletError('Worldlet’s Hermes runtime has no site-packages folder');
 let changed=false;
 for(const site of sites)for(const [name,text] of [[HOOK+'.py',hermesCodexBorrowHook(launcher,home)],[HOOK+'.pth','import '+HOOK+'\n']]){
  const file=path.join(site,name);
  if(read(file)===text)continue;
  fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);changed=true;
 }
 return changed;
}
const done=new Map<string,Promise<string|null>>();
/** Makes the profile at `home` a resident service through its own `hermes` (`command`): the key first, when it has none,
 * so the gateway starts with its API server on; then `hermes gateway install --start-now --start-on-login` (idempotent:
 * an installed service is kept, an outdated one repaired) and `hermes gateway start`, or `restart` when the key was just
 * added, so a gateway already running reads it. Resolves null when it is resident with its API server on, else why not
 * (a reason, not an error); rejects when Hermes' own command failed. Once per profile and app run. */
export function keepHermesResident(home:string,command:HermesCommand,{runtime=null,worldTools=null}:{runtime?:HermesRuntime|null;worldTools?:((home:string)=>HermesWorldToolsServer)|null}={}):Promise<string|null> {
 // The real path only keys the once-per-profile run: the profile is set up at the path the caller names, so the
 // registered World tools entry names it as `worldTools` does elsewhere (a Mac temp folder is /var, really /private/var).
 const key=realPath(home);
 let work=done.get(key);
 if(!work){work=resident(home,command,runtime,worldTools);done.set(key,work);work.catch(()=>done.delete(key));}
 return work;
}
async function resident(home:string,command:HermesCommand,runtime:HermesRuntime|null,worldTools:((home:string)=>HermesWorldToolsServer)|null):Promise<string|null> {
 const config=read(path.join(home,'config.yaml')),envFile=path.join(home,'.env');
 if(!config.trim())return 'its profile has no settings yet';
 // A person's own Hermes runs on their own Python, which Worldlet never changes.
 if(!runtime&&hermesBorrowsCodex(config))return 'its model is this computer’s Codex sign-in, which Worldlet borrows read-only only on its own runtime';
 const hooked=runtime?keepCodexBorrow(runtime,home):false;
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
 await run(['gateway',added||hooked||registered?'restart':'start']);
 return settings.off?'its API server is turned off (platforms.api_server.enabled: false in config.yaml)':null;
}

/** The standard Hermes Agent's conversation turn (owner decision 2026-10-08: Fox reaches the Hermes Agent it set up
 * and a person's own by one path): a foreground turn of the private World goes to its resident API server, a session per
 * Fox thread, as LocalHarnessRuntime runs a person's own Hermes Agent, while that server answers and its profile has
 * Worldlet's World tools (the standing `worldlet` MCP server); otherwise, and for background work, setup, the practice world and every other action, the built-in runtime
 * as before. Why the server was not used is recorded once (`note`); the built-in runtime keeps the conversation, so
 * Fox says nothing. Account sign-ins and model-free source reads stay on the built-in runtime's World service. */
export class ServerFirstRuntime implements AgentRuntime {
 private readonly builtIn:AgentRuntime;
 private readonly server:AgentRuntime;
 private readonly conversation:{noted:string|null;unavailable():Promise<string|null>};
 private readonly note:(reason:string)=>void;
 constructor(builtIn:AgentRuntime,server:AgentRuntime,conversation:{noted:string|null;unavailable():Promise<string|null>},note:(reason:string)=>void){this.builtIn=builtIn;this.server=server;this.conversation=conversation;this.note=note;}
 cancel(){this.builtIn.cancel();this.server.cancel();}
 steer(text:string){return this.builtIn.steer(text);}
 async run(body:Row,home:string,onEvent?:AgentEventHandler):Promise<Row> {
  if(body.action==='chat'&&body._background!==true&&body.mode!=='setup'&&body.sample!==true){
   const reason=await this.conversation.unavailable();
   if(reason===null){this.conversation.noted=null;return this.server.run(body,home,onEvent);}
   if(this.conversation.noted!==reason){this.conversation.noted=reason;try{this.note(reason);}catch{}}
  }
  return this.builtIn.run(body,home,onEvent);
 }
}
