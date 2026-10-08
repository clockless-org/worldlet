import {safeAttentionURL} from '../../core/attention/index.ts';
const kinds:Record<string,[string,string]>={gmail:['mail','Mail'],'google-calendar':['calendar','Calendar'],note:['file','Notes'],file:['file','File'],notion:['book','Notion'],weather:['file','Weather'],strava:['file','Strava'],'google-maps':['file','Maps'],conversations:['chat','Conversation']};
export function attentionSources(page){
 const seen=new Set<string>();
 return (page.worldItemSources||[]).filter(ref=>{if(!ref||typeof ref.id!=='string'||!ref.id)return false;const key=JSON.stringify([ref.provider,ref.id]);if(seen.has(key))return false;seen.add(key);return true;}).map(ref=>{
  const [icon,provider]=kinds[ref.provider]||['file',ref.provider||'Source'];
  return {ref,icon,label:ref.title?provider+' · '+ref.title:provider,url:safeAttentionURL(ref.url)};
 });
}
