import {APP_DEFINITIONS,appletStatus} from '../applets/index.ts';
import {phoneWebAddress} from './phone-web.ts';

/** The Applets in the World for a phone or browser's Applets page while the World page is not there
 * (core/phone/README.md#web), as the page lists them (ui/shell/notion-world.ts `world().places`): the catalog Applets the
 * person keeps (`onboarding.unlockedApplets`, less `hiddenApplets`; with no list, those installed by default), each with
 * its lamp from its connection (core/applets appletStatus). The page's own extras (the person's own sites, its order by
 * last use, what each Applet is doing this moment) wait for it. */
export function hostAppletPlaces({onboarding,connections}:{onboarding?:{unlockedApplets?:string[],hiddenApplets?:string[]}|null,connections?:any[]}){
 const unlocked=Array.isArray(onboarding?.unlockedApplets)?onboarding.unlockedApplets:null,hidden=Array.isArray(onboarding?.hiddenApplets)?onboarding.hiddenApplets:[];
 const kept=(app:typeof APP_DEFINITIONS[number])=>!hidden.includes(app.id)&&(unlocked?unlocked.includes(app.id):(app as {installByDefault?:boolean}).installByDefault!==false);
 return APP_DEFINITIONS.filter(kept).map(app=>{
  const status=appletStatus(app,Array.isArray(connections)?connections:[]),phase=status.phase;
  return {key:app.key,title:app.title,provider:app.connection?.provider||app.key,label:status.label,source:!['browser','local','unavailable','planned'].includes(phase),url:phoneWebAddress(app),
   state:['reading','syncing'].includes(phase)?'busy':status.failed?'failed':status.connected||status.usableWithoutLogin||['browser','local'].includes(phase)?'ready':'off'};
 });
}

/** An Applet's or a card's own turns of Fox's conversation, from the saved turns (oldest first, `role` user or assistant),
 * as the page's thread gives them (ui/companion native-chat threadOf): each line the person said with Fox's answer. */
export function threadPairs(rows:{role:string,text:string,createdAt:string}[]){
 const pairs:{user:string,text:string,at:string}[]=[];
 for(const row of Array.isArray(rows)?rows:[]){
  if(row.role==='user')pairs.push({user:row.text,text:'',at:row.createdAt});
  else if(pairs.length&&!pairs.at(-1)!.text)pairs.at(-1)!.text=row.text;
  else pairs.push({user:'',text:row.text,at:row.createdAt});
 }
 return pairs.slice(-4);
}
