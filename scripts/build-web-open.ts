import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Worldlet in a web browser (ui/web, agent/windows/README.md#web): the page the relay serves at /open/. The website build
// (in the operations repository) calls this with its own output folder; `node scripts/build-web-open.ts <folder>` builds
// it for a look or a check.
export const WEB_OPEN_FILES=['index.html','open.js','open.css'];
export async function buildWebOpen(root:string,output:string,version='web'){
 await mkdir(output,{recursive:true});
 await build({entryPoints:[path.join(root,'ui/web/open.ts')],outfile:path.join(output,'open.js'),bundle:true,format:'esm',minify:true,target:'es2022',
  define:{WORLDLET_VERSION:JSON.stringify(version)},legalComments:'none'});
 await copyFile(path.join(root,'ui/web/open.html'),path.join(output,'index.html'));
 await copyFile(path.join(root,'ui/web/open.css'),path.join(output,'open.css'));
 return WEB_OPEN_FILES;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output){process.stderr.write('Usage: node scripts/build-web-open.ts <folder>\n');process.exit(2);}
 await buildWebOpen(fileURLToPath(new URL('../',import.meta.url)),path.resolve(output));
 process.stdout.write(`Built ${WEB_OPEN_FILES.join(', ')} in ${output}\n`);
}
