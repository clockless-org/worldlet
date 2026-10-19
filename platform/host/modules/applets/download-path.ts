import fs from 'node:fs';
import path from 'node:path';

/** Where a website download goes: straight into Downloads, like a browser does, with no save dialog (owner request
 * 2026-10-07: do it for the person instead of asking). A name already taken there gets " (1)", " (2)" and so on. */
export function downloadPath(folder:string,suggested:string,exists:(file:string)=>boolean=fs.existsSync){
 let name=path.basename(String(suggested??'')).replace(/[\x00-\x1f]/g,'');
 if(!name.trim()||name.length>180||name==='.'||name==='..')name='download';
 const ext=path.extname(name),stem=ext&&ext!==name?name.slice(0,-ext.length):name,suffix=ext&&ext!==name?ext:'';
 for(let n=0;n<1000;n++){const file=path.join(folder,n?`${stem} (${n})${suffix}`:name);if(!exists(file))return file;}
 return path.join(folder,`${stem} (${Date.now()})${suffix}`);
}
