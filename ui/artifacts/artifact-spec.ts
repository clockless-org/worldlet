import {themeArtifact} from '../themes/index.ts';
import type {ArtifactPageSpec} from '../../core/artifacts/index.ts';
// The theme's Artifact look as the host's generator reads it (core/artifacts/README.md#theme-driven-artifacts): the texts
// of its rules and prompt, its pictures' roles and colours, and its materials as data addresses a page may place. Read
// once from the published theme; null when the theme leaves Artifacts to the host's card or its files cannot be read.
let loading:Promise<{spec:ArtifactPageSpec;materials:Record<string,string>}|null>|null=null;
const dataURL=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
export function artifactPageSpec(){
 loading??=(async()=>{
  const look=themeArtifact();if(!look)return null;
  const read=async(url:string)=>{const response=await fetch(url);if(!response.ok)throw Error(url);return response;};
  const [style,prompt]=await Promise.all([read(look.style).then(r=>r.text()),read(look.prompt).then(r=>r.text())]);
  const materials=Object.fromEntries(await Promise.all(look.materials.map(async m=>[m.id,await dataURL(await (await read(m.url)).blob())] as const)));
  return {spec:{theme:look.theme,style,prompt,references:look.references.map(r=>({role:r.role})),materials:look.materials.map(m=>({id:m.id,usage:m.usage})),colors:look.colors as Record<string,string>},materials};
 })().catch(()=>{loading=null;return null;});
 return loading;
}
