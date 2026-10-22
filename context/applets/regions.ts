/** Product groups use stable world storage IDs; each Applet definition owns its catalog region and custom region assignments win.
 * Owner request 2026-10-08: Create merged into Work, its `library` slot became Social, and Explore (`travel`) became Entertainment. */
export const APPLET_REGION_TITLES={home:'Home',work:'Work',library:'Social',money:'Life',health:'Games',travel:'Entertainment'};
/** The Games area's starters: setup unlocks three games (2048, Snake, Minesweeper first) without showing them. */
export const GAME_STARTERS=['game-2048','snake','minesweeper'];
/** Saved area layouts before the regroup are version 2: what was put in Create (`library`) moves to Work, and Create's
 * own name and pins go with it, since `library` is now Social. Version 1 pins were never read. */
export const AREA_LAYOUT_VERSION=3;
type SavedLayout={version?:unknown;names?:unknown;assignments?:unknown;pins?:unknown;themePins?:unknown;[key:string]:unknown};
const record=(value:unknown):Record<string,any>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:null;
function movePins(pins:Record<string,any>|null){
 if(!pins||!Array.isArray(pins.library))return pins;
 const out={...pins},work=Array.isArray(out.work)?[...out.work]:Array(5).fill(null),moved=pins.library.filter((id:unknown)=>typeof id==='string'&&!work.includes(id));
 for(let i=0;i<5&&moved.length;i++)if(typeof work[i]!=='string')work[i]=moved.shift();
 delete out.library;out.work=work;return out;
}
/** A saved area layout as it reads after the regroup; a layout already at AREA_LAYOUT_VERSION comes back unchanged. */
export function migrateAreaLayout<T extends SavedLayout>(saved:T):T{
 if(!record(saved)||Number(saved.version)>=AREA_LAYOUT_VERSION)return saved;
 const out:any={...saved,version:saved.version===2?AREA_LAYOUT_VERSION:saved.version};
 const assignments=record(saved.assignments);
 if(assignments)out.assignments=Object.fromEntries(Object.entries(assignments).map(([id,region])=>[id,String(region).replace(/^building-/,'')==='library'?'work':region]));
 const names=record(saved.names);
 if(names&&Object.hasOwn(names,'library')){out.names={...names};delete out.names.library;}
 if(saved.version===2){
  out.pins=movePins(record(saved.pins));
  const themePins=record(saved.themePins);
  if(themePins)out.themePins=Object.fromEntries(Object.entries(themePins).map(([theme,pins])=>[theme,movePins(record(pins))??pins]));
 }
 return out;
}
/** Setup offers a few common apps per area instead of the whole catalog (owner feedback 2026-10-03); the rest wait behind Show all apps and search. */
export const SETUP_SUGGESTIONS={home:['apple-notes','outlook','browser','google-photos'],work:['chatgpt','claude','slack','google-drive'],library:['whatsapp','telegram','discord','facebook'],money:['uber','airbnb','strava','booking'],travel:['tiktok','twitch','apple-music','bilibili']};
/** Games never take room on the setup page: the Games area starts with its starters and the shelf holds the rest. */
export const SETUP_HIDDEN_REGIONS=['health'];
/** Whether setup shows an app before Show all apps: chosen, suggested, found here or touched (so a removed app stays in view). Seeded games stay out of sight. */
export function setupOffers(app:{id:string;key:string;region?:string},chosen:boolean,also:Set<string>){
 if(also.has(app.id)||also.has(app.key))return true;
 if(SETUP_HIDDEN_REGIONS.includes(app.region||''))return false;
 return chosen||(SETUP_SUGGESTIONS[app.region||'']||[]).includes(app.key);
}
/** What each area starts with on top of what the person already has (owner Order 2026-10-12, Kelvin, replacing
 * 2026-10-11's "popular starters up to twelve"): a few popular Applets per area, in order, every one opens on any
 * computer. Games use GAME_STARTERS. */
export const AREA_STARTERS:Record<string,readonly string[]>={
 home:['weather','outlook','google-photos'],
 work:['chatgpt','notion','slack','github','claude','zoom'],
 library:['whatsapp','discord','reddit','telegram','instagram','x'],
 money:['google-maps','amazon','airbnb','uber','booking','paypal'],
 travel:['youtube','spotify','netflix','wikipedia','twitch','apple-podcasts'],
};
/** How many Applets each area gets beyond the ones the person already has (found here, brought or connected). */
export const AREA_STARTER_COUNT=4;
/** What setup selects before the person changes anything (owner Order 2026-10-12). Mail, Calendar and the Browser are
 * setup's own draft; this adds the apps installed on this computer (`detected`) and the apps brought from the person's
 * Agent or already connected (`brought`, by provider). Then every area gets AREA_STARTER_COUNT more from AREA_STARTERS
 * (Home counts setup's draft among its own), and the Games area its three starter games. Every other Applet stays in
 * each area's panel under Recommended. Explicit unchecks (`touched`) are respected. */
export function seedAppletSelection(apps:readonly {id:string;key:string;region?:string}[],detected:Set<string>,selected:Set<string>,touched:Set<string>,brought:Set<string>=new Set()){
 for(const app of apps)if((detected.has(app.key)||brought.has(app.key))&&!touched.has(app.id))selected.add(app.id);
 const own=(a:{key:string})=>detected.has(a.key)||brought.has(a.key);
 for(const [region,keys] of Object.entries(AREA_STARTERS)){
  const added=()=>apps.filter(a=>a.region===region&&selected.has(a.id)&&!own(a)).length;
  for(const key of keys){if(added()>=AREA_STARTER_COUNT)break;const app=apps.find(a=>a.key===key);if(app&&!touched.has(app.id))selected.add(app.id);}
 }
 const games=[...GAME_STARTERS.map(key=>apps.find(a=>a.key===key)).filter(Boolean),...apps.filter(a=>a.region==='health'&&!GAME_STARTERS.includes(a.key))] as {id:string;region?:string}[];
 for(const app of games){if(apps.filter(a=>a.region==='health'&&selected.has(a.id)).length>=3)break;if(!touched.has(app.id))selected.add(app.id);}
}
