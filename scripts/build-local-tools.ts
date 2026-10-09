import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Harness-independent native helpers. No Agent bootstrap or private profile.
import {mkdir,readdir,copyFile} from 'node:fs/promises';
const source=new URL('../platform/local-tools/',import.meta.url);
const output=process.env.WORLDLET_UI_BUILD_OUTPUT ? pathToFileURL(path.join(process.env.WORLDLET_UI_BUILD_OUTPUT,'local-tools')+'/') : new URL('../dist/WorldletWeb/local-tools/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of await readdir(source,{withFileTypes:true})){
 if(file.isFile()&&(file.name.endsWith('.py')||file.name==='requirements.txt'))await copyFile(new URL(file.name,source),new URL(file.name,output));
}
