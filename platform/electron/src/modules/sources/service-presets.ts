import {readStoredServicePreset,removeServicePreset,saveServicePreset} from '../../../../../context/sources/index.ts';
import type {ServicePreset} from '../../../../../contracts/service-presets.ts';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';

// Service presets (context/applets/INTEGRATIONS.md#service-presets): named, saved reads of a Worldlet Service, kept in the
// World's ledger (`state.service-presets` in world.sqlite). Core checks each one; this keeps the records. A preset
// holds no key: the Service's key stays in the vault with its connection.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type PresetLedger={
 servicePresets():Row[];
 saveServicePreset(preset:Row):void;
 deleteServicePreset(id:string):void;
 transaction<T>(work:()=>T):T;
};
const NOT_READY='Service presets are kept in your own World: finish setting it up first.';

/** Every stored preset that still passes Core's checks, by ID. */
export function loadServicePresets(db:PresetLedger):ServicePreset[] {
 return db.servicePresets().flatMap(row=>{const preset=readStoredServicePreset(row);return preset?[preset]:[];}).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Saves the presets that changed and removes those that went, in one transaction. */
export function storeServicePresets(db:PresetLedger,before:readonly ServicePreset[],after:readonly ServicePreset[]){
 db.transaction(()=>{
  for(const preset of after)if(JSON.stringify(before.find(item=>item.id===preset.id))!==JSON.stringify(preset))db.saveServicePreset(preset as unknown as Row);
  for(const preset of before)if(!after.some(item=>item.id===preset.id))db.deleteServicePreset(preset.id);
 });
}

export interface ServicePresets {
 /** The `servicePresets` host action: `list`, `save` (`preset`) or `delete` (`id`). Each answers every preset. */
 handle(request:Row):{presets:ServicePreset[];preset?:ServicePreset};
}
export function createServicePresets({ledger,now=()=>new Date().toISOString()}:{ledger:()=>PresetLedger|null;now?:()=>string}):ServicePresets {
 return {
  handle(request){
   const db=ledger();
   if(!db)throw new WorldletError(NOT_READY);
   const presets=loadServicePresets(db),operation=request?.operation??'list';
   if(operation==='list')return {presets};
   try{
    if(operation==='save'){
     const saved=saveServicePreset(presets,request.preset,now());
     storeServicePresets(db,presets,saved.presets);
     return {presets:saved.presets,preset:saved.preset};
    }
    if(operation==='delete'){
     const next=removeServicePreset(presets,request.id);
     storeServicePresets(db,presets,next);
     return {presets:next};
    }
   }catch(error){
    if(error instanceof WorldletError)throw error;
    throw new WorldletError(error instanceof Error&&error.message?error.message:'Could not change that preset.');
   }
   throw new WorldletError('Unknown presets operation.');
  },
 };
}
