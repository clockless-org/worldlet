// Release checks on the RC harness's disposable library (#1492). No Electron import: scripts/onboarding-paths-check.ts
// runs these rules in plain Node.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Named checks a packaged release may run, only on a library `rcCheckRoot` accepts (#1492). */
export const RELEASE_CHECKS=['onboarding-paths'];
export const RC_CHECK_MARKER='.worldlet-rc-check';
/** The RC harness's disposable library for a release check (scripts/onboarding-paths.ts), or undefined.
 * A release build otherwise always opens the person's own library, so the harness proves itself three
 * ways: the launch names a release check, the folder is a fresh `worldlet-rc-*` directly in this
 * computer's temporary folder, and it holds the marker file with the one-time token passed in
 * WORLDLET_RC_CHECK_TOKEN. Nothing a person double-clicks satisfies that. The release smoke's own window capture
 * (`--window-capture`) is the other launch that may name one: on a release host that is also someone's own Mac
 * (scripts/release-hosts.mjs stand-in) the smoke must not open, or quit, that person's Worldlet. */
export function rcCheckRoot(argv=process.argv,env=process.env,tmp=os.tmpdir(),read=(file:string)=>fs.readFileSync(file,'utf8'),real=(dir:string)=>fs.realpathSync(dir)):string|undefined {
 const flag=argv.indexOf('--check'),root=env.WORLDLET_RC_PROFILE_ROOT,token=env.WORLDLET_RC_CHECK_TOKEN;
 const named=flag>=1&&RELEASE_CHECKS.includes(argv[flag+1]??''),capture=argv.indexOf('--window-capture')>=1;
 if(!(named||capture)||!root||!token||!/^[0-9a-f]{32,128}$/.test(token))return undefined;
 if(!path.isAbsolute(root)||!/^worldlet-rc-[A-Za-z0-9_-]{4,64}$/.test(path.basename(root)))return undefined;
 try{
  if(real(path.dirname(root))!==real(tmp)||read(path.join(root,RC_CHECK_MARKER)).trim()!==token)return undefined;
  return real(root);
 }catch{return undefined;}
}
