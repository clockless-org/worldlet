// api/ is the one surface the operations repository uses (api/README.md): every module there loads, and every path
// in api/files.ts exists, so a move inside this repository that forgets api/ fails here instead of over there.
import assert from 'node:assert/strict';
import {existsSync,readdirSync} from 'node:fs';
import {FILES} from '../api/files.ts';
for(const [key,file] of Object.entries(FILES))assert(existsSync(file),`api/files.ts ${key}: ${file} does not exist`);
const modules=readdirSync('api').filter(name=>name.endsWith('.ts')&&!name.endsWith('.d.ts')&&name!=='files.ts');
for(const name of modules){
 const exports=await import(`../api/${name}`);
 for(const [key,value] of Object.entries(exports))assert(value!==undefined,`api/${name} exports ${key} as undefined`);
}
console.log(`PASS api/: ${modules.length} modules load and ${Object.keys(FILES).length} paths exist`);
