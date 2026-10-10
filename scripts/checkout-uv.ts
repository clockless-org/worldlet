// uv for Worldlet's own tools Python (platform/electron/src/modules/media/tools-python.ts) when the app runs from a
// checkout: a packaged app bundles it, Dev and the checks that start the app pass the checkout's `.local/bootstrap` one
// as WORLDLET_UV, installed here when missing. Without it every local tool fails, the browser driver among them (Mac
// Alpha 4096: Fox's browser task got "Fox is preparing the local runtime" on every step once #109 removed the Hermes
// setup that used to install it).
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

export function checkoutUv(checkout:string):string|null {
 const windows=process.platform==='win32';
 const bin=path.join(checkout,'.local/bootstrap',windows?'Scripts':'bin'),uv=path.join(bin,windows?'uv.exe':'uv');
 if(existsSync(uv))return uv;
 const python=process.env.WORLDLET_SETUP_PYTHON||(windows?'python':'python3');
 console.log('Installing uv for Worldlet’s local tools…');
 const venv=spawnSync(python,['-m','venv',path.dirname(bin)],{stdio:'inherit'});
 const pip=venv.status===0&&spawnSync(path.join(bin,windows?'python.exe':'python3'),['-m','pip','install','uv==0.12.15'],{stdio:'inherit'});
 if(!pip||pip.status!==0)console.error('uv could not be installed; Worldlet’s local tools stay unavailable until uv is installed in '+path.dirname(bin)+'.');
 return existsSync(uv)?uv:null;
}
