import fs from 'node:fs';
import path from 'node:path';

const scripts=new Map<string,string>();
/** A page script from the packaged UI, read once per run; Dev builds (`reread`) read it again so a rebuild
 * applies. A read that fails throws every time and is never kept. */
export function pageScript(webRoot:string,name:string,reread:boolean):string {
 const file=path.join(webRoot,name);
 const cached=reread?undefined:scripts.get(file);
 if(cached!==undefined)return cached;
 const text=fs.readFileSync(file,'utf8');
 if(!reread)scripts.set(file,text);
 return text;
}
