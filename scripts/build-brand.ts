// Deterministic vector exports; Swift reads the same polygon master directly.
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {brandAssets} from '../ui/components/primitives/brand.ts';
export async function buildBrand(output=new URL('../resources/styles/builtin/assets/brand/',import.meta.url)) {
 // Read on each build so the website watcher sees edits to the shared master.
 const master=JSON.parse(await readFile(new URL('../resources/styles/builtin/assets/brand/mark.json',import.meta.url),'utf8'));
 await mkdir(output,{recursive:true});
 for(const [name,content] of Object.entries<any>(brandAssets(master)))await writeFile(new URL(name,output),content);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 await buildBrand();
 await import('./windows-icon.ts');
 // Keep the public compatibility URL on the same generated design.
 await writeFile(new URL('../resources/common/icon.svg',import.meta.url),brandAssets()['worldlet-app-icon.svg']);
 console.log('Built the shared Worldlet mark, app icon, monochrome logo and brand tokens.');
}
