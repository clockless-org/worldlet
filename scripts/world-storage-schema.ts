// Embed one shared SQL contract as a module the desktop host imports; no runtime resource loading.
import {readFile,writeFile} from 'node:fs/promises';
const sql=(await readFile(new URL('../contracts/storage/world-views.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n').trim();
const file=new URL('../contracts/storage/world-views.ts',import.meta.url);
const next='// Generated from contracts/storage/world-views.sql; run node scripts/world-storage-schema.ts.\n'+
 'export const WORLD_VIEWS_SQL='+JSON.stringify(sql)+';\n';
const current=await readFile(file,'utf8').then(text=>text.replace(/\r\n/g,'\n'),()=>'');
if(process.argv.includes('--check')){if(current!==next)throw Error('Stale storage schema: contracts/storage/world-views.ts');}
else if(current!==next)await writeFile(file,next);
console.log('PASS shared World storage views match the desktop host');
