import {app} from 'electron';
import os from 'node:os';
import path from 'node:path';
import {rcCheckRoot} from './rc-check.ts';
export {RELEASE_CHECKS} from './rc-check.ts';
// One library root per installed channel and checkout. The names are the Mac host's
// existing library names, so an installed person's world opens unchanged.
export type Channel='release'|'dev';
export interface Profile {
 channel:Channel;
 /** Twelve-hex linked-worktree id; empty for the primary Dev checkout and releases. */
 worktree:string;
 root:string;
 title:string;
 /** Packaged UI root (dist/WorldletWeb in development). */
 webRoot:string;
 /** Bundled helper resources: Hermes, local tools, agent-browser. */
 resources:string;
 smoke:boolean;
 /** A packaged release launched by the RC harness for one release check on a disposable library (`rcCheckRoot`). */
 rcCheck?:boolean;
}
export const platformName=():'macos'|'windows'|'linux'=>process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux';
export function libraryBase(){
 if(process.platform==='darwin')return path.join(os.homedir(),'Library/Application Support');
 if(process.platform==='win32')return process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local');
 return process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local/share');
}
/** The Mac host's app identity (bundle and defaults domain). */
export const macDomain=({channel,worktree}:Pick<Profile,'channel'|'worktree'>)=>channel==='release'?'app.worldlet.mac':worktree?'app.worldlet.mac.dev.wt'+worktree:'app.worldlet.mac.dev';
export function libraryName(channel:Channel,worktree:string){
 if(channel==='release')return 'Worldlet';
 return worktree?path.join('Worldlet Worktrees',worktree):'Worldlet Development';
}
/** The library this installation owns, even when a launch opens another one (an RC check's disposable
 * library, a named Windows smoke profile, the contract check). Program files and the installation's model
 * credential live in it, beside the World data and never mixed into it (`INSTALLATION_FOLDERS`). */
export const installationRoot=({channel,worktree}:Pick<Profile,'channel'|'worktree'>)=>path.join(libraryBase(),libraryName(channel,worktree));
/** Folders Worldlet kept beside the library before everything moved into it (2026-10-04); the new
 * location adopts or retires them (`installation.ts`, `model-access.ts`, `voice/speech.ts`). */
export const legacyFolder=(name:'Worldlet Runtime'|'Worldlet Speech'|'Worldlet Model Access')=>path.join(libraryBase(),name);
export function resolveProfile(argv=process.argv,env=process.env):Profile {
 // A packaged app is always the release channel: no environment variable unlocks development
 // profiles, capture probes or checks in a shipped build (the Mac host honoured WORLDLET_DEV only in Debug).
 const channel:Channel=app.isPackaged?'release':'dev';
 const worktree=channel==='dev'&&/^[0-9a-f]{12}$/.test(env.WORLDLET_WORKTREE_PROFILE||'')?env.WORLDLET_WORKTREE_PROFILE:'';
 const smoke=argv.includes('--smoke-check');
 // The contract check never touches a real library, even in a release build.
 const contract=argv.includes('--host-contract-check')?path.join(os.tmpdir(),'worldlet-contract-'+process.pid):undefined;
 // A named Windows profile under %LOCALAPPDATA% (a folder name, never a path), as the release smoke
 // uses to keep its data apart from the real library; the C# host honoured the same variable.
 const named=process.platform==='win32'&&/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(env.WORLDLET_WINDOWS_PROFILE||'')&&!/\.$/.test(env.WORLDLET_WINDOWS_PROFILE!)?path.join(libraryBase(),env.WORLDLET_WINDOWS_PROFILE!):undefined;
 const rc=channel==='release'&&!contract?rcCheckRoot(argv,env):undefined;
 const override=contract??rc??named??(channel==='dev'?env.WORLDLET_PROFILE_ROOT:undefined);
 const root=path.resolve(override||path.join(libraryBase(),libraryName(channel,worktree)));
 // Development launchers run a candidate outside the checkout, so they name the checkout explicitly.
 const resources=app.isPackaged?process.resourcesPath:path.resolve(env.WORLDLET_REPO_ROOT||path.join(app.getAppPath(),'../..'));
 const webRoot=path.resolve(channel==='dev'&&env.WORLDLET_WEB_ROOT||(app.isPackaged?path.join(process.resourcesPath,'WorldletWeb'):path.join(resources,'dist/WorldletWeb')));
 const title=env.WORLDLET_WINDOW_TITLE||(channel==='dev'?'Worldlet Dev':'Worldlet');
 return {channel,worktree,root,title,webRoot,resources,smoke,rcCheck:!!rc};
}
