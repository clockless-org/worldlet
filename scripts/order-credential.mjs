// Order (core/distribution/order.ts): the installed Alpha app on the development Mac has no checkout, so the
// daemon leaves it a copy of this host's admin credential (.local/machine-service.json) where the app looks
// (platform/electron/src/modules/shell/machine-credential.ts machineCredentialFile; keep the two paths equal). Owner-only
// file permissions, rewritten only when the enrolment changes; removed when the host is no longer enrolled.
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function libraryBase(platform=process.platform,env=process.env,home=os.homedir()){
 const p=platform==='win32'?path.win32:path.posix; // the given platform's separators, whichever host computes it
 if(platform==='darwin')return p.join(home,'Library/Application Support');
 if(platform==='win32')return env.LOCALAPPDATA||p.join(home,'AppData/Local');
 return env.XDG_DATA_HOME||p.join(home,'.local/share');
}
export const credentialCopy=(base=libraryBase())=>path.join(base,'Worldlet Internal','machine-service.json');
/** Only the development host (03), whose owner uses the installed Alpha app; release hosts never get a copy. */
export function shareOrderCredential(root,role,{target=credentialCopy()}={}){
 if(role!=='development')return {status:'disabled'};
 let source='';try{source=readFileSync(path.join(root,'.local/machine-service.json'),'utf8');}catch{}
 let parsed=null;try{parsed=JSON.parse(source);}catch{}
 if(!parsed?.url||!parsed?.token||!parsed?.machine){if(existsSync(target))rmSync(target,{force:true});return {status:'not-enrolled'};}
 let current='';try{current=readFileSync(target,'utf8');}catch{}
 if(current===source)return {status:'current'};
 mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
 writeFileSync(target,source,{mode:0o600});try{chmodSync(target,0o600);}catch{}
 return {status:'updated'};
}
