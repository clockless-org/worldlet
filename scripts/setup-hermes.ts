// Installs a pinned, project-local runtime. Never touches ~/.hermes.
// WORLDLET_HERMES_CHECKOUT installs this checkout's pinned runtime into another checkout's .local: a
// release host installs it into its primary checkout from a temporary gate checkout (scripts/machine-nightly.mjs).
import {readFile,mkdir,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const spec=JSON.parse(await readFile(path.join(root,'harness/hermes/runtime.json'),'utf8'));
const home=process.env.WORLDLET_HERMES_CHECKOUT?path.resolve(process.env.WORLDLET_HERMES_CHECKOUT):root;
const source=path.join(home,'.local/hermes-source'),bootstrap=path.join(home,'.local/bootstrap');
const windows=process.platform==='win32',bin=windows?'Scripts':'bin',python=process.env.WORLDLET_SETUP_PYTHON||(windows?'python':'python3');
const uv=path.join(bootstrap,bin,windows?'uv.exe':'uv');
const runtimePython=path.join(source,'.venv',bin,windows?'python.exe':'python3');
async function run(cmd,args){const child=spawn(cmd,args,{cwd:root,stdio:'inherit',env:{...process.env,UV_PYTHON_INSTALL_DIR:path.join(home,'.local/hermes-python')}});const [code]=await once(child,'exit');if(code)throw Error(`${cmd} exited ${code}`);}
await mkdir(path.join(home,'.local'),{recursive:true});
try{await access(uv);}catch{await run(python,['-m','venv',bootstrap]);await run(path.join(bootstrap,bin,windows?'python.exe':'python3'),['-m','pip','install','uv==0.12.15']);}
try{await access(path.join(source,'.git'));}catch{await run('git',['init',source]);await run('git',['-C',source,'remote','add','origin',spec.repository]);}
await run('git',['-C',source,'-c','http.lowSpeedLimit=1024','-c','http.lowSpeedTime=60','fetch','--depth=1','--progress','origin',spec.revision]);
await run('git',['-C',source,'checkout','--detach',spec.revision]);
// Do not inherit the runner's system Python.  On macOS GitHub runners that
// interpreter can link against /Library/Frameworks/Python.framework, which
// cannot ship inside the app.  uv's managed distribution is self-contained
// and is checked by bundle-portability.py before signing.
await run(uv,['sync','--project',source,'--python',spec.python,'--managed-python','--extra','mcp','--extra','google','--no-dev','--frozen']);
await run(uv,['pip','install','--python',runtimePython,spec.sessionSDK,spec.webSearchDependency]);
await run(python,['scripts/verify-hermes.py']);
console.log('Hermes installed and verified.');
