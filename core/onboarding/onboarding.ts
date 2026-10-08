import {APP_DEFINITIONS,AREA_LAYOUT_VERSION} from '../applets/index.ts';
import type {Onboarding} from '../../contracts/onboarding.ts';
import {characters,utf8Length} from '../companion/index.ts';
const regions=['home','work','development','library','money','health','travel','people'];
const GAME_IDS=()=>APP_DEFINITIONS.filter(a=>a.game).map(a=>a.id);
const FIRST_GAMES=['app-game-2048','app-snake','app-minesweeper','app-sudoku','app-breakout'];
const unique=(ids:string[])=>ids.filter((id,i)=>ids.findIndex(other=>other.normalize('NFC')===id.normalize('NFC'))===i);
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(id=>typeof id==='string');
const blank=(s:string)=>/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]*$/u.test(s);
const modules:Record<string,string>={today:'home',inbox:'home',household:'home',journal:'home',projects:'work',code:'development',documents:'work',meetings:'work',notes:'work',reading:'work',research:'work',browser:'home',spending:'money',budget:'money',bills:'money',assets:'money',activity:'health',sleep:'health',care:'health',trip:'money',bookings:'money','travel-journal':'money',relationships:'people','follow-ups':'people',gatherings:'people'};
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const LAYOUT_ENTRIES=1000;
function regionLayout(value:unknown):Record<string,unknown>{
 if(!plain(value)||JSON.stringify(value).length>200_000)throw Error('Invalid area layout.');
 const map=(field:unknown,keep:(v:unknown)=>boolean)=>Object.fromEntries((plain(field)?Object.entries(field):[]).filter(([key,v])=>key.length<=100&&keep(v)).slice(0,LAYOUT_ENTRIES));
 const text=(v:unknown)=>typeof v==='string'&&v.length<=100,number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const pins=(v:unknown)=>Array.isArray(v)&&v.length<=5&&v.every(id=>id===null||text(id));
 return {version:value.version===2||value.version===AREA_LAYOUT_VERSION?value.version:1,names:map(value.names,text),themes:map(value.themes,text),assignments:map(value.assignments,text),
  pins:map(value.pins,pins),usage:map(value.usage,number),lastUsedAt:map(value.lastUsedAt,number),
  // Pinned places of the themes not shown now (ui/themes/theme-placements.ts).
  ...plain(value.themePins)?{themePins:Object.fromEntries(Object.entries(value.themePins).filter(([key,v])=>key.length<=100&&plain(v)).slice(0,20).map(([key,v])=>[key,map(v,pins)]))}:{}};
}
/** Host authorizes referenced sources/items and performs note ingestion before persisting this result. */
export function updateOnboarding(previous:Onboarding,body:Record<string,unknown>):Onboarding {
 const setup:Onboarding=JSON.parse(JSON.stringify({version:1,presets:['home'],completed:false,...previous}));
 const establish=(region:string)=>{setup.establishedRegions=unique([...(setup.establishedRegions??[]),'home',region]);setup.presets=unique([...setup.presets,region]);};
 const region=(value:unknown,message:string)=>{if(typeof value!=='string'||!regions.includes(value))throw Error(message);return value;};
 const applet=()=>{const id=body.applet;if(typeof id!=='string'||!id.startsWith('app-')||characters(id).length>=100)throw Error('Choose an Applet.');return id;};
 switch(body.operation){
  case 'builtRegion':if(typeof body.region==='string'&&regions.includes(body.region))establish(body.region);break;
  case 'connectionRegion':{const place=region(body.region,'Unsupported region.');if(typeof body.id!=='string')throw Error('Invalid connection.');setup.connectionRegions={...setup.connectionRegions,[body.id]:place};break;}
  case 'region':{
   const place=region(body.region,'Choose a supported region.');
   if((body.sourceIds!=null&&!strings(body.sourceIds))||(body.connectionIds!=null&&!strings(body.connectionIds)))throw Error('Choose valid source and connection IDs.');
   const sources=strings(body.sourceIds)?body.sourceIds:[],connections=strings(body.connectionIds)?body.connectionIds:[];
   if(!sources.length&&!connections.length||sources.length>1000||connections.length>100)throw Error('Connect a source or choose an existing local source first.');
   setup.regionSources={...setup.regionSources,[place]:unique([...(setup.regionSources?.[place]??[]),...sources])};
   const routes={...setup.connectionRegions};for(const id of connections)if(!Object.hasOwn(routes,id))Object.defineProperty(routes,id,{value:place,writable:true,enumerable:true,configurable:true});setup.connectionRegions=routes;establish(place);break;
  }
  case 'presets':{
   const ids=body.presets;if(!strings(ids)||ids.length>8||ids.some(id=>!regions.includes(id)))throw Error('Choose a supported place.');
   if(ids.some(id=>id!=='home'&&!setup.establishedRegions?.includes(id)))throw Error('Connect a source before building a region.');
   setup.presets=unique(['home',...ids]);break;
  }
  case 'note':{
   const {title,text,preset,moduleKey}=body;
   if(typeof title!=='string'||typeof text!=='string'||typeof preset!=='string'||!regions.includes(preset)||blank(title)||characters(title).length>160||utf8Length(text)>24000)throw Error('Enter a title and a note of up to 24 KB.');
   if(typeof moduleKey==='string'&&(!Object.hasOwn(modules,moduleKey)||modules[moduleKey]!==preset))throw Error('Choose a module in this region.');establish(preset);break;
  }
  case 'intro':if(typeof body.step!=='number'||!Number.isInteger(body.step)||body.step<0||body.step>3)throw Error('Invalid introduction step.');setup.introStep=Math.max(setup.introStep??0,body.step);break;
  case 'journey':if(typeof body.stage!=='string'||!['connect','mail-value','attention','review','prepared','browser','outcome','memory','add-applet','finish','world-tour','first-value','first-value-review','first-value-running','first-value-outcome'].includes(body.stage))throw Error('Invalid onboarding step.');setup.journeyStage=body.stage;if(typeof body.itemId==='string')setup.journeyItemId=body.itemId;else delete setup.journeyItemId;break;
  case 'removeApplet':setup.hiddenApplets=unique([...(setup.hiddenApplets??[]),applet()]);break;
  case 'moveApplet':throw Error('Applet positions are fixed by the world design.');
  case 'unlock':{const id=applet();if(setup.hiddenApplets)setup.hiddenApplets=setup.hiddenApplets.filter(value=>value.normalize('NFC')!==id.normalize('NFC'));setup.unlockedApplets=unique([...(setup.unlockedApplets??APP_DEFINITIONS.filter(a=>a.installByDefault!==false).map(a=>a.id)),id]);break;}
  // The areas' names, membership, pinned places and when each Applet was last used (owner request 2026-10-04: the
  // most recently used stand on the ground). The page owns its shape (ui/world/region-layout.ts); here it is bounded.
  case 'regionLayout':setup.regionLayout=regionLayout(body.layout);break;
  case 'mail':setup.mailStarted=true;break;
  case 'setup':{
   const ids=body.applets;
   if(!strings(ids)||ids.length>APP_DEFINITIONS.length||ids.some(id=>!APP_DEFINITIONS.some(app=>app.id===id)))throw Error('Choose supported Applets.');
   setup.unlockedApplets=unique(ids);setup.hiddenApplets=(setup.hiddenApplets??[]).filter(id=>!ids.includes(id));
   setup.introStep=3;setup.completed=true;setup.offeredGames=GAME_IDS();setup.journeyStage='world-tour';delete setup.journeyItemId;break;
  }
  // Worlds set up before the Games area get its games once; one the person removed stays removed.
  case 'offerGames':{
   if(!setup.completed||!setup.unlockedApplets)break;
   // gamesOffered marks worlds offered the first five; Breakout then moved into the Random game.
   const offered=new Set(setup.offeredGames??(setup.gamesOffered?FIRST_GAMES:[])),hidden=new Set(setup.hiddenApplets??[]);
   if(hidden.has('app-breakout'))hidden.add('app-random-game');
   const fresh=GAME_IDS().filter(id=>!offered.has(id)&&!hidden.has(id));
   setup.unlockedApplets=unique([...setup.unlockedApplets.filter(id=>id!=='app-breakout'),...fresh]);
   setup.offeredGames=GAME_IDS();delete setup.gamesOffered;break;
  }
  case 'complete':setup.completed=true;break;
  default:throw Error('Unknown setup action.');
 }
 return setup;
}
