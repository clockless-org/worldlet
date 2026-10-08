import type {World} from '../../contracts/world.ts';
import {applyModuleWorld} from './world-modules.ts';
import {attachBrowserDevice} from './browser-sample.ts';
import {enrichSampleWorld,SAMPLE_TRIP} from './sample-persona.ts';
import {applySampleHierarchy} from './sample-hierarchy.ts';
import {sampleWorld} from './sample-world.ts';

// Bundled fictional content. Never compile or copy the user's private sources here.
//
// The seed and the room hierarchy are scaffolding that the persona fills: every
// page the user can open, every attention item and every Matter comes from
// sample-persona.json. Saved item statuses come back in through itemStatus, so a
// letter marked done in the sample stays done across a restart.
export function makeSampleWorld({now=new Date(),itemStatus={}}={}){
 const world=structuredClone(sampleWorld) as World;world.native=true;world.cloud=false;world.workspace='Sample world';
 world.spaces.find(s=>s.theme==='rocket').trip={...SAMPLE_TRIP};
 return applyModuleWorld(attachBrowserDevice(enrichSampleWorld(applySampleHierarchy(world),{now,itemStatus})));
}
