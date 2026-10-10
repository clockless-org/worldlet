import {WORLD_LAYOUT} from './space/world-layout.ts';
// Compatibility projection; navigation and devices share one source.
const sites=()=>Object.fromEntries(Object.entries(WORLD_LAYOUT.regions).map(([id,r])=>[id,{
 center:r.center,label:r.label,bounds:r.bounds,slots:r.placements.map(s=>s.anchor),placements:r.placements
}]));

export const VILLAGE_SITES=sites();
