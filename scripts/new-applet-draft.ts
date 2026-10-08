import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {APP_DEFINITIONS,getApp} from '../core/applets/catalog.ts';
import {WORLD_PRESETS} from '../ui/world/world-presets.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function createAppletDraft({key,title,reference,region,website=null,outputRoot=path.join(root,'.local/applet-drafts')}){
 if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key||'')||key.length>64)throw Error('Use a lowercase hyphenated key, up to 64 characters.');
 if(APP_DEFINITIONS.some(a=>a.key===key||a.id==='app-'+key))throw Error('Applet already exists; extend its existing definition.');
 if(typeof title!=='string'||!title.trim()||title.length>80)throw Error('Provide a title of 1–80 characters.');
 const base=getApp(reference);if(!base)throw Error('Choose an existing Applet as the model reference.');
 if(!WORLD_PRESETS.some(p=>p.id===region))throw Error('Choose a current region ID; independent world placement requires an explicit design.');
 if(website){const url=new URL(website);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Use a public HTTPS homepage without credentials, query or fragment.');website=url.href;}
 // Drafts never copy the reference service's logo, provider, authorization or custom renderer.
 const definition={id:'app-'+key,key,title:title.trim(),region,version:1,...website?{fullView:{kind:'web',url:website,platform:'web'}}:{},description:'Draft: describe the useful task before integration.',scene:{...base.scene,renderer:'preset-device',version:1},connection:{kind:'planned',provider:null,capability:'planned'},availability:{world:false,reason:'Authoring draft; not integrated or verified.'}};
 const plan={schema:'worldlet-applet-authoring-v1',reference:base.key,website,preview:{modelIntent:null,stateEvidence:null},fullView:{preferred:website?'web':'native',implemented:false,handler:null},brand:{source:null,file:null},operations:[],acceptance:[],remaining:['Complete functional model design and original branding','Implement and verify direct Full View routing','Implement actual operations and permissions before advertising them','Register and preview deliberately; this plan is not a runtime manifest']};
 await mkdir(outputRoot,{recursive:true});const directory=path.join(outputRoot,key);
 try{await access(directory);throw Error('Draft already exists; nothing overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(directory);
 await writeFile(path.join(directory,'app.ts'),'export default '+JSON.stringify(definition,null,2)+';\n',{flag:'wx'});
 await writeFile(path.join(directory,'authoring.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 return directory;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [key,title,reference,region,website,...extra]=process.argv.slice(2);
 try{if(!region||extra.length)throw Error('Usage: node scripts/new-applet-draft.ts <key> "<title>" <reference-key> <region> [https-url]');console.log(await createAppletDraft({key,title,reference,region,website}));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
