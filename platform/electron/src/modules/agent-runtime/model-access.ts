import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {safeStorage} from 'electron';
import {WorldletError,writeAtomic} from '../../files.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import {installationRoot,legacyFolder,macDomain} from '../../profile.ts';
import type {RuntimeContext} from './types.ts';

/** The installation token Worldlet's own model service once issued (Mac WorldletModelAccess +
 * InstallationModelCredential). Worldlet no longer provides models (owner decision 2026-10-05), so nothing
 * enrolls or sends it any more; the existing file is left where it is. User/provider API keys never enter this store. */
const valid=(value:string)=>/^[0-9a-f]{64}$/.test(value);
const failure=()=>new WorldletError('Could not access this installation’s model credential. Please retry.');

/** The Mac host's app identity: the token directory beside the libraries was named after it. */
export function modelAccessService(context:Pick<RuntimeContext,'profile'>){
 return macDomain(context.profile)+'.model-access';
}
/** `<installation library>/model-access`: one token per installed channel (and Dev worktree), as before. */
export const modelAccessDirectory=(context:Pick<RuntimeContext,'profile'>)=>path.join(installationRoot(context.profile),'model-access');
/** Before 2026-10-04 the token sat beside the libraries in `Worldlet Model Access/<service>`. It moves into the
 * library once, keeping the same installation (and its daily allowance); a token already there wins. */
export function adoptLegacyToken(context:Pick<RuntimeContext,'profile'>,legacy=legacyFolder('Worldlet Model Access')){
 const from=path.join(legacy,modelAccessService(context)),file=path.join(from,'installation.token');
 if(!fs.existsSync(file))return;
 const directory=modelAccessDirectory(context),target=path.join(directory,'installation.token');
 try{
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  // A hard link fails instead of replacing a token a concurrent launch already enrolled.
  fs.linkSync(file,target);
 }catch(error){if((error as NodeJS.ErrnoException)?.code!=='EEXIST')return;}
 fs.rmSync(from,{recursive:true,force:true});
 try{fs.rmdirSync(legacy);}catch{}
}

/** Mac/Linux: an owner-only plain token file (the Mac host's exact location). Windows: the
 * same file name, encrypted with the user's DPAPI key through safeStorage.
 * The Mac host's one-time legacy Keychain migration is not ported. */
export function loadInstallationToken(directory:string):string {
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const windows=process.platform==='win32';
 let info=fs.lstatSync(directory);
 if(!info.isDirectory()||(!windows&&info.uid!==process.getuid()))throw failure();
 if(!windows)fs.chmodSync(directory,0o700);
 const file=path.join(directory,'installation.token');
 const read=()=>{
  const descriptor=fs.openSync(file,fs.constants.O_RDONLY|(windows?0:fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK));
  try{
   info=fs.fstatSync(descriptor);
   if(!info.isFile()||(!windows&&(info.uid!==process.getuid()||info.size!==64))||info.size>16384)throw failure();
   if(!windows)fs.fchmodSync(descriptor,0o600);
   const data=fs.readFileSync(descriptor);
   let value:string;
   try{value=windows?safeStorage.decryptString(data):data.toString('utf8');}catch{throw failure();}
   if(!valid(value))throw failure();
   return value;
  }finally{fs.closeSync(descriptor);}
 };
 try{return read();}catch(error){if((error as NodeJS.ErrnoException)?.code!=='ENOENT')throw error instanceof WorldletError?error:failure();}
 const value=crypto.randomBytes(32).toString('hex');
 let data:Buffer;
 if(windows){
  if(!safeStorage.isEncryptionAvailable())throw new WorldletError('Windows model credentials are unavailable. Sign in with the original Windows user and retry.');
  data=safeStorage.encryptString(value);
 }else data=Buffer.from(value,'utf8');
 // Separate processes must not enroll different tokens: write a private temporary file,
 // then hard-link it into place, which fails instead of replacing a concurrent winner.
 const temporary=path.join(directory,crypto.randomUUID().toUpperCase()+'.pending');
 const output=fs.openSync(temporary,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(windows?0:fs.constants.O_NOFOLLOW),0o600);
 try{
  if(fs.writeSync(output,data)!==data.length)throw failure();
  fs.fsyncSync(output);
 }finally{fs.closeSync(output);}
 try{fs.linkSync(temporary,file);}
 catch(error){if((error as NodeJS.ErrnoException)?.code!=='EEXIST')throw failure();}
 finally{fs.rmSync(temporary,{force:true});}
 return read();
}

/** Fox setup choice 'model-source': the person chose their own Codex sign-in as
 * Fox's model at setup (Codex is a model source for the built-in Harness, not a second Agent). Only
 * the source ID is saved, never a path or credential. */
export function readModelSource(root:string):'local-codex'|null {
 const value=readAgentSetting(root,'model-source');
 return value?.version===1&&value.id==='local-codex'?'local-codex':null;
}
export function writeModelSource(root:string,id:'local-codex'|null){
 writeAgentSetting(root,'model-source',id===null?null:{version:1,id});
}
/** The Codex sign-in Worldlet may borrow, read-only: CODEX_HOME or ~/.codex. */
export const codexHome=()=>process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
/** Whether this computer has a Codex sign-in with an access token (its expiry is Hermes's to report). */
export function codexSignedIn(home=codexHome()):boolean {
 try{const token=JSON.parse(fs.readFileSync(path.join(home,'auth.json'),'utf8').replace(/^\uFEFF/,''))?.tokens?.access_token;return typeof token==='string'&&!!token.trim();}
 catch{return false;}
}

/** Fox's model source (contracts/model-sources.json). Worldlet pays for no model (owner decision 2026-10-05):
 * every build hands the Harness this computer's Codex sign-in (`local-codex`), unless the person's own provider
 * (an API key, or the model a local Agent brought) is configured in Hermes, which then pays for every tier. With
 * neither, Fox says it needs an Agent on this computer instead of answering. */
export class ModelAccess {
 get source():'local-codex' {return 'local-codex';}
 get localCodex(){return true;}
 get codexHome(){return codexHome();}
}
