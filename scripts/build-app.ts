// Build the desktop app for development (interface + Electron host), without launching or packaging it.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run(command:string,args:string[],env=process.env){
 const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});
 const [code]=await once(child,'exit');
 if(code!==0)throw Error(`${command} exited ${code}`);
}
// Cloudflare Workers Builds still runs `npm run build`. That command is the desktop
// app locally; on their Linux builders it must emit the marketing site instead.
if(process.env.WORKERS_CI==='1'){
 const installer=fileURLToPath(new URL('../node_modules/esbuild/install.js',import.meta.url));
 if(await access(installer).then(()=>true,()=>false)) await run(process.execPath,[installer]);
 // A computed specifier: the open-source export has no website, and its desktop build never reaches this branch.
 const {buildWeb}=await import(new URL('./build-website.ts',import.meta.url).href);
 await buildWeb();
}else{
 await run(process.execPath,['scripts/build-native-ui.ts']);
 await run(process.execPath,['scripts/build-electron.ts']);
 console.log('Built Worldlet for development. Run npm run dev to prepare and open it.');
}
