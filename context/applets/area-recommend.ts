/** What an Area's panel recommends (owner Order 2026-10-07): every catalog Applet related to this Area that is not in
 * the person's World yet (owner Order 2026-10-12: all of them, not a short list), worked out on this computer each time
 * the panel opens. No model is asked. An Area is related to
 * its own catalog category, and also, more weakly, to the categories of the Applets the person moved into it. Within
 * those, an Applet installed on this computer comes first, then one whose website the person visits in Worldlet's
 * browser, then catalog order. Ahead of all of them come the Applets the person's own Agent suggested when it described
 * itself (core/agent/agent-profile.ts, owner request 2026-10-11), in their own Area. */
export type AreaCandidate={id:string;key:string;category:string;host?:string|null};
export type AreaRecommendInput={
 area:string;
 apps:readonly AreaCandidate[];
 /** Applets in the person's World, and the Area each one stands in now. */
 mine:ReadonlyMap<string,string>;
 /** Applets the person removed from the World: never pushed back at them. */
 removed?:ReadonlySet<string>;
 /** Catalog keys of apps installed on this computer. */
 installed?:ReadonlySet<string>;
 /** Visits per website host in Worldlet's browser (no pages or titles). */
 visits?:Readonly<Record<string,number>>;
 /** Catalog keys the person's own Agent suggested. */
 suggested?:ReadonlySet<string>;
 /** Leave out to list them all. */
 limit?:number;
};
export const appHost=(url:unknown)=>{if(typeof url!=='string')return null;try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return null;}};
/** An Applet's website host: a website Applet's own page, or the original site a native Applet reads (Linear, Todoist). */
export const appletHost=(app:{fullView?:any}|null|undefined)=>appHost(app?.fullView?.url||app?.fullView?.original?.url);
/** Visits for a host, counting its subdomains and parent (m.youtube.com counts for youtube.com, posthog.com for app.posthog.com). */
function visitsFor(host:string|null|undefined,visits:Readonly<Record<string,number>>){
 if(!host)return 0;let total=0;for(const [visited,count] of Object.entries(visits))if(visited===host||visited.endsWith('.'+host)||host.endsWith('.'+visited))total+=count;return total;
}
/** How strongly each catalog category belongs to an Area: its own category 3, each Applet moved in from another category 1, at most 2. */
export function areaCategories(area:string,apps:readonly AreaCandidate[],mine:ReadonlyMap<string,string>){
 const weight:Record<string,number>={[area]:3};
 for(const app of apps)if(mine.get(app.id)===area&&app.category!==area)weight[app.category]=Math.min(2,(weight[app.category]||0)+1);
 return weight;
}
export function recommendForArea({area,apps,mine,removed=new Set(),installed=new Set(),visits={},suggested=new Set(),limit=Infinity}:AreaRecommendInput):string[]{
 const weight=areaCategories(area,apps,mine);
 return apps.map((app,order)=>({app,order,related:weight[app.category]||0,visited:Math.min(50,visitsFor(app.host,visits)),installed:installed.has(app.key)?1:0,suggested:suggested.has(app.key)&&app.category===area?1:0}))
  .filter(({app,related})=>related>0&&!mine.has(app.id)&&!removed.has(app.id))
  .sort((a,b)=>b.suggested-a.suggested||b.related-a.related||b.installed-a.installed||b.visited-a.visited||a.order-b.order)
  .slice(0,limit).map(({app})=>app.id);
}
