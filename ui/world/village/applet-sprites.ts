import {onThemeApplied} from '../../themes/index.ts';
import {WORLD_WIDTH} from '../world-design.ts';
import {POPULAR_APPS,WEB_GAME_APPLETS} from '../../../core/applets/index.ts';
import {WORLD_LAYOUT} from '../world-layout.ts';
// Named slots keep placements independent of catalog ordering.
const sprites=()=>Object.fromEntries([
 ...Object.entries(WORLD_LAYOUT.regions).flatMap(([region,r])=>Object.entries(r.slots).map(([key,s])=>[key,{region,anchor:s.anchor,width:s.width}])),
 ...Object.entries(WORLD_LAYOUT.worldSlots)
]);

export const APPLET_SPRITES:Record<string,{region:string|null;anchor:number[];width:number}>=sprites();
onThemeApplied(()=>Object.assign(APPLET_SPRITES,sprites()));
// New catalog entries share finite authored slots across pages, never overlap.
// Canonical region membership (core/applets/regions.ts) already has a named slot.
for(const app of [...POPULAR_APPS,...WEB_GAME_APPLETS]){if(APPLET_SPRITES[app.key])continue;const region=WORLD_LAYOUT.regions[app.region],slot=region.placements[0];APPLET_SPRITES[app.key]={region:app.region==='people'?'travel':app.region,anchor:slot.anchor,width:slot.maxSize[0]*WORLD_WIDTH};}
