import path from 'node:path';
import {installationRoot} from '../../profile.ts';
import type {Host} from '../../host/types.ts';
import {bundledResource} from '../../resources.ts';
import {ToolsPython} from './tools-python.ts';

let shared:ToolsPython|null=null;
/** This installation's tools Python (`<installation library>/tools`, beside local speech). */
export function toolsPython(host:Host):ToolsPython {
 if(!shared){
  const library=process.platform==='win32'?host.profile.root:installationRoot(host.profile);
  shared=new ToolsPython({folder:path.join(library,'tools'),uv:()=>bundledResource(host.profile,'uv'),
   requirements:path.join(host.profile.webRoot,'local-tools','requirements.txt')});
 }
 return shared;
}

/** Python for local helpers (speech, coding sessions, the browser driver's relay). */
export function helperPython(host:Host):Promise<string> {return toolsPython(host).path();}
