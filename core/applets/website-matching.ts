import {APP_DEFINITIONS} from './catalog.ts';

// Match only known service destinations. Never save imported URLs or bookmark titles.
const aliases:Record<string,string[]>={
 posthog:['https://us.posthog.com/','https://eu.posthog.com/','https://posthog.com/'],
 cloudflare:['https://cloudflare.com/'],github:['https://github.com/'],
 x:['https://twitter.com/'],notion:['https://notion.so/','https://notion.com/'],
 gmail:['https://mail.google.com/'],'google-calendar':['https://calendar.google.com/'],
 jira:['https://jira.atlassian.com/'],
};
const normalizedHost=(host:string)=>host.toLowerCase().replace(/^www\./,'');
function destination(raw:string){
 try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
}
// Each host lists its services; shared hosts such as Google and Atlassian must match the service path, too.
const hostTargets=new Map<string,{id:string;path:string}[]>();
for(const app of APP_DEFINITIONS)for(const raw of [app.fullView?.url,app.fullView?.original?.url,...(aliases[app.key]||[])]){
 const url=destination(raw);if(!url)continue;
 const host=normalizedHost(url.hostname),targets=hostTargets.get(host)||[];targets.push({id:app.id,path:url.pathname.replace(/\/$/,'')});hostTargets.set(host,targets);
}
const sharedHosts=new Set([...hostTargets].filter(([host,targets])=>new Set(targets.map(t=>t.id)).size>1||['google.com','atlassian.com','apple.com'].includes(host)).map(([host])=>host));
export function matchWebsiteApplets(urls:readonly string[]):string[]{
 const found=new Set<string>();
 for(const raw of urls){
  const url=destination(raw);if(!url)continue;
  const host=normalizedHost(url.hostname),shared=sharedHosts.has(host);
  for(const {id,path} of hostTargets.get(host)||[])
   if(!shared||!!path&&(url.pathname===path||url.pathname.startsWith(path+'/')))found.add(id);
 }
 return [...found];
}
/** The website Applet in the World that a page belongs to, so a link from outside any Applet opens
 * there, never passing through the Browser: a catalog website Applet whose service the page is, or
 * an Applet made from that site (site-applet.ts). Applets with their own panel keep such links in
 * the Browser; they show records, not pages. */
export function websiteAppletFor(raw:string,applets:readonly {id:string;web:boolean;siteHost?:string|null}[]):string|null {
 const url=destination(raw);if(!url||url.protocol!=='https:')return null;
 const host=normalizedHost(url.hostname),ids=new Set(matchWebsiteApplets([url.href]));
 const app=applets.find(a=>a.id!=='app-browser'&&a.web&&(ids.has(a.id)||!!a.siteHost&&normalizedHost(a.siteHost)===host));
 return app?.id||null;
}
