import {mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

// A private directory under the OS temp folder for the check's run, removed afterwards whether it passes or throws.
// Windows refuses the removal (EBUSY) while a check's child processes are still exiting from it, so it is
// retried; the promise form, because Node 22's rmSync ignores maxRetries there and fails at once.
// `base` names another parent: a check that binds a unix socket inside uses a short one, since macOS's temp folder
// (/var/folders/…/T/) leaves too little of a socket path's 104 bytes.
export async function withTempDir<T>(prefix:string,run:(dir:string)=>T|Promise<T>,base=tmpdir()):Promise<T>{
 const dir=mkdtempSync(path.join(base,prefix));
 try{return await run(dir);}finally{await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
}
