// Mac signing retries one file's unanswered secure-timestamp request (#1036). @electron/osx-sign runs
// `codesign` from PATH once per file of the bundle (hundreds of locale.pak files), each asking Apple's
// timestamp service; a few dropped requests failed every whole-package attempt on 02. This wrapper,
// first on PATH while packaging, reruns only that file's codesign, up to five times, and only for a
// timestamp failure. Any other failure, and the last one, passes through unchanged.
import {mkdtempSync,writeFileSync,chmodSync,rmSync,statSync,openSync,readSync,closeSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function codesignRetryScript({codesign='/usr/bin/codesign',attempts=5,pause='$((attempt*5))'}={}){
 return ['#!/bin/sh','err=$(mktemp)',`attempt=1`,`while :; do`,
  ` "${codesign}" "$@" 2>"$err"; status=$?`,
  ` if [ $status -ne 0 ] && [ $attempt -lt ${attempts} ] && grep -qi timestamp "$err"; then echo "codesign: timestamp not received; retry $attempt of ${attempts-1}" >&2; sleep ${pause}; attempt=$((attempt+1)); continue; fi`,
  ' cat "$err" >&2; rm -f "$err"; exit $status','done',''].join('\n');
}
// Puts the wrapper first on this process's PATH; returns the directory, removed on exit.
export function installCodesignRetry(options){
 const dir=mkdtempSync(path.join(os.tmpdir(),'worldlet-codesign-'));
 writeFileSync(path.join(dir,'codesign'),codesignRetryScript(options));chmodSync(path.join(dir,'codesign'),0o755);
 process.env.PATH=dir+path.delimiter+process.env.PATH;
 process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
 return dir;
}
// Only executable code needs a signature of its own (#1105): Mach-O files (thin or universal) and the
// bundles osx-sign signs as directories. Everything else in the app (locale.pak, images, asar, data) is
// sealed by its enclosing bundle's signature, so a change still breaks verification. osx-sign's own
// test (isbinaryfile) signed every non-text file: 250 codesign calls and timestamp requests for the plain
// Electron app instead of 22. Returns true for a file osx-sign should leave to the seal.
const machOMagic=new Set(['feedface','feedfacf','cefaedfe','cffaedfe','cafebabe','bebafeca']);
export function sealedNotSigned(file){
 try{
  if(!statSync(file).isFile())return false;
  const bytes=Buffer.alloc(4),fd=openSync(file,'r');try{readSync(fd,bytes,0,4,0);}finally{closeSync(fd);}
  return !machOMagic.has(bytes.toString('hex'));
 }catch{return false;} // unreadable: let osx-sign decide
}
