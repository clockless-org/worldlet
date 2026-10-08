import {worldActions} from '../core/tools/gateway.ts';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {validateAppletRuntimes} from '../core/applets/runtime.ts';
export async function buildAppletRuntime(root:string,output:string){
 const rows=[],actions=worldActions();
 for(const app of APP_DEFINITIONS){
  const dir=path.join(root,'ui/applets',app.key),spec=JSON.parse(await readFile(path.join(dir,'runtime.json'),'utf8'));
  const description=await readFile(path.join(dir,'applet.md'),'utf8');
  if(spec.key!==app.key||!description.includes('## Runtime')||!description.includes('## Status'))throw Error('Incomplete Applet contract: '+app.key);
  rows.push(spec);const target=path.join(output,'applets',app.key);await mkdir(target,{recursive:true});await writeFile(path.join(target,'applet.md'),description);await writeFile(path.join(target,'runtime.json'),JSON.stringify(spec,null,2)+'\n');
  const normalized=validateAppletRuntimes([spec])[0];
  if(normalized.analysisPrompt){const prompt=await readFile(path.join(dir,normalized.analysisPrompt),'utf8');if(!prompt.trim()||prompt.length>12000)throw Error('Invalid Applet prompt');await mkdir(path.join(target,'prompts'),{recursive:true});await writeFile(path.join(target,normalized.analysisPrompt),prompt);}
  const commands=actions.filter(a=>a.target==='applet:'+app.key);
  if(!commands.some(a=>a.action==='launch'))throw Error('Missing Applet launch command: '+app.key);
  await writeFile(path.join(target,'commands.json'),JSON.stringify({version:1,appletId:app.id,commands},null,2)+'\n');
 }
 await writeFile(path.join(output,'applet-runtime.json'),JSON.stringify(validateAppletRuntimes(rows)));
}
