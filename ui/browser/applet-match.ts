import {WORLD_APPS} from '../../core/applets/index.ts';
// Match owned service hosts, never page titles, query parameters or suffix lookalikes.
const extraHosts:Record<string,string[]>={github:['github.com'],'google-calendar':['calendar.google.com'],notion:['notion.so','notion.site','notion.com'],youtube:['youtu.be'],x:['twitter.com']};
// A game is one page of a site it does not own (worldlet.ai, nytimes.com, poki.com), so only its own pages
// match it, never the rest of that site (owner Order 2026-10-06: worldlet.ai offered "Open Random game Applet"
// in place of Make Applet). The Random game lands in a different /games/play/<slug>/ each time.
const pathScopes:Record<string,string>={'random-game':'/games/'};
const scopeOf=(app:any,url:URL)=>(pathScopes[app.key]??(app.region==='health'?url.pathname:'/')).replace(/\/(index\.html?)?$/,'');
export function appletForWebsite(value:string){
 let url:URL;try{url=new URL(value);}catch{return null;}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
 const host=url.hostname.toLowerCase().replace(/^www\./,''),path=url.pathname;
 const matches=WORLD_APPS.filter(app=>app.key!=='browser').flatMap(app=>{
  const view:any=app.fullView,site=view?.original||view;let hosts=[...(extraHosts[app.key]||[])],scope='';
  try{if(site?.url){const own=new URL(site.url);hosts.push(own.hostname.replace(/^www\./,''));scope=scopeOf(app,own);}}catch{}
  if(scope&&path!==scope&&!path.startsWith(scope+'/'))return [];
  // A generic Google homepage is not an identity for Maps or another Google service.
  hosts=hosts.filter(h=>h!=='google.com'&&h!=='accounts.google.com');
  return hosts.filter(h=>host===h||host.endsWith('.'+h)).map(h=>({app,length:h.length+scope.length}));
 });
 matches.sort((a,b)=>b.length-a.length);return matches[0]?.app||null;
}
