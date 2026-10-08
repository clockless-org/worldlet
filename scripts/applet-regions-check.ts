import assert from 'node:assert/strict';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {setupText} from '../ui/onboarding/setup-language.ts';
import {APPLET_REGION_TITLES,AREA_LAYOUT_VERSION,FEATURED_STARTERS,SETUP_SUGGESTIONS,migrateAreaLayout,seedAppletSelection,setupOffers} from '../core/applets/regions.ts';
const keys=APP_DEFINITIONS.map(a=>a.key);
assert.equal(new Set(keys).size,keys.length,'Each app has one definition');
for(const app of APP_DEFINITIONS)assert.ok(Object.hasOwn(APPLET_REGION_TITLES,app.region||''),app.key+' definition names one of the six areas');
for(const detected of [new Set<string>(),new Set(APP_DEFINITIONS.map(a=>a.key)),new Set(['whatsapp','strava','cloudflare'])]){
 const selected=new Set<string>();seedAppletSelection(APP_DEFINITIONS,detected,selected,new Set());
 for(const region of Object.keys(APPLET_REGION_TITLES))assert.ok(APP_DEFINITIONS.filter(a=>a.region===region&&selected.has(a.id)).length>=3,region);
 for(const key of FEATURED_STARTERS)assert.ok(selected.has('app-'+key),'Featured default: '+key);
 for(const key of detected)assert.ok(selected.has('app-'+key));
}
const selected=new Set<string>();seedAppletSelection(APP_DEFINITIONS,new Set(['whatsapp']),selected,new Set(['app-whatsapp','app-youtube']));assert.ok(!selected.has('app-whatsapp')&&!selected.has('app-youtube'));
const unchecked=new Set<string>();seedAppletSelection(APP_DEFINITIONS,new Set(),unchecked,new Set(FEATURED_STARTERS.map(key=>'app-'+key)));
for(const key of FEATURED_STARTERS)assert.ok(!unchecked.has('app-'+key),'Respect uncheck: '+key);
// Setup offers chosen apps plus a few suggestions per area; games and the rest wait behind Show all apps.
for(const keys of Object.values(SETUP_SUGGESTIONS))for(const key of keys)assert.ok(keys.length<=4&&APP_DEFINITIONS.some(a=>a.key===key),'Suggestion is a catalog app: '+key);
const offer=new Set<string>();seedAppletSelection(APP_DEFINITIONS,new Set(),offer,new Set());
const offered=APP_DEFINITIONS.filter(a=>setupOffers(a,offer.has(a.id),new Set()));
assert.ok(offered.length<=45,'Setup offers a short list: '+offered.length);
assert.ok(!offered.some(a=>a.region==='health'),'Seeded games stay off the setup page');
assert.ok(APP_DEFINITIONS.filter(a=>a.key==='cloudflare'||a.key==='wordle').every(a=>setupOffers(a,false,new Set([a.id]))),'Found, matched or touched apps stay in view');
// Every app setup can show says what it is for in each setup language (ui/onboarding/setup-purposes.ts).
for(const app of APP_DEFINITIONS)for(const language of ['zh','ja','es']){
 const purpose=setupText(app.purpose||'',language);
 assert.ok(purpose!==app.purpose&&purpose.trim()&&purpose.length<=90&&!purpose.includes('\n'),language+' purpose for '+app.key);
}
assert.equal(setupText(APP_DEFINITIONS.find(a=>a.key==='taobao').purpose,'zh'),'在淘宝购物；Fox 可以帮你搜索和比价');
// The regroup (owner request 2026-10-08): Create joined Work, its `library` slot became Social, Explore became Entertainment.
assert.deepEqual(Object.values(APPLET_REGION_TITLES),['Home','Work','Social','Life','Games','Entertainment']);
const region=(key:string)=>APP_DEFINITIONS.find(a=>a.key===key)?.region;
for(const key of ['notion','google-docs','figma','canva','obsidian','google-drive'])assert.equal(region(key),'work',key+' is Work now');
for(const key of ['x','instagram','reddit','facebook','discord','whatsapp','telegram','xiaohongshu'])assert.equal(region(key),'library',key+' is Social');
for(const key of ['youtube','netflix','tiktok','spotify','twitch','bilibili'])assert.equal(region(key),'travel',key+' is Entertainment');
for(const key of ['amazon','taobao','doordash','uber'])assert.equal(region(key),'money',key+' stays in Life');
// A layout saved before the regroup: what was in Create moves to Work with its pins; its name goes, since `library` is Social now.
const before={version:2,names:{library:'Studio',travel:'Fun'},themes:{library:'library'},assignments:{'app-notion':'library','app-x':'travel','app-gmail':'building-library'},
 pins:{library:['app-notion',null,'app-figma',null,null],work:['app-github','app-slack',null,null,null]},themePins:{castle:{library:[null,'app-canva']}},lastUsedAt:{'app-notion':5}};
const after=migrateAreaLayout(before);
assert.equal(after.version,AREA_LAYOUT_VERSION);
assert.deepEqual(after.assignments,{'app-notion':'work','app-x':'travel','app-gmail':'work'});
assert.deepEqual(after.names,{travel:'Fun'});assert.deepEqual(after.themes,{library:'library'});
assert.deepEqual(after.pins,{work:['app-github','app-slack','app-notion','app-figma',null]});
assert.deepEqual(after.themePins,{castle:{work:['app-canva',null,null,null,null]}});
assert.equal(migrateAreaLayout(after),after,'a regrouped layout is left alone');
assert.deepEqual(migrateAreaLayout({version:3,assignments:{'app-x':'library'}}).assignments,{'app-x':'library'},'Social choices are kept');
console.log('PASS complete, exclusive six-area catalog; the 2026-10-08 regroup and its layout migration; installed selection; three starters per area; explicit unchecks; short setup offer; purposes in every setup language');
