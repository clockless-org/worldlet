// Reset Fox's file step (platform/electron/src/modules/fox/reset-files.ts): World data leaves the library, while
// the model connection, the host's own files and the installation's folders (Hermes runtime, local speech, model
// credential) stay. The runtime lives in <library>/runtime (on Mac too since 2026-10-04) and can be mid-install
// while Reset runs; moving it failed with EPERM, so Reset never got back to the sign-in page (#1568). A move that
// does fail puts everything back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HOST_RETAINED,removeExceptRetained} from '../platform/electron/src/modules/fox/reset-files.ts';

const write=(root:string,file:string)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),file);};
const files=['world.sqlite','sources/notes/a.json','speech/py312/model/config.json','model-access/installation.token','runtime/0123456789abcdef0123456789abcdef01234567-0123456789ab/source/.venv/bin/python3','runtime/cache/wheel','runtime/python/cpython-3.12/bin/python3','agent/private/hermes/.env','agent/private/hermes/state.db','runtime/hermes-0123456789abcdef/source/.venv/Scripts/python.exe','runtime/hermes-0123456789abcdef.lock/pid','preferences.json','Browser/Local State'];
const library=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-reset-'));for(const file of files)write(root,file);return root;};
const left=(root:string)=>files.filter(file=>fs.existsSync(path.join(root,file)));
const retained=new Set(['agent/private/hermes/.env',...HOST_RETAINED]);

for(const folder of ['runtime','speech','tools','model-access'])assert(HOST_RETAINED.includes(folder),'Reset keeps the installation folder '+folder);
const root=library();
try{
 removeExceptRetained(root,retained);
 assert.deepEqual(left(root),files.filter(file=>!['world.sqlite','sources/notes/a.json','agent/private/hermes/state.db'].includes(file)),'World data leaves; the model connection, host files, local speech, the model credential and the Mac and Windows runtimes (with a running install’s lock) stay');
 assert.deepEqual(fs.readdirSync(root).filter(name=>name.startsWith('.reset-')),[],'the staging folder is removed');
}finally{fs.rmSync(root,{recursive:true,force:true});}

// A folder held open (Windows EPERM): nothing is lost and the error says the library was left as it was.
const held=library(),rename=fs.renameSync;
try{
 fs.renameSync=((from:fs.PathLike,to:fs.PathLike)=>{if(path.basename(String(from))==='sources')throw Object.assign(Error(`EPERM: operation not permitted, rename '${from}'`),{code:'EPERM'});return rename(from,to);}) as typeof fs.renameSync;
 assert.throws(()=>removeExceptRetained(held,retained),/Reset could not finish; your library was left as it was/);
 fs.renameSync=rename;
 assert.deepEqual(left(held),files,'a failed move puts everything back');
}finally{fs.renameSync=rename;fs.rmSync(held,{recursive:true,force:true});}
console.log('PASS reset files: World data leaves, the model connection, host files and the installation folders (runtime, speech, model access) stay; a failed move puts everything back');
