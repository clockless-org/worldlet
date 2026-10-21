import {readStoredServicePreset,removeServicePreset,saveServicePreset} from '../../../../context/connectors/index.ts';
import {contextReader,contextWriter,type ContextWriter} from '../../../../context/store/index.ts';
import {ledgerContext} from '../../store/context-storage.ts';
import type {ServicePreset} from '../../../../contracts/service-presets.ts';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../types.ts';

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
 return contextReader(ledgerContext(db)).bodies('service-presets').flatMap(row=>{const preset=readStoredServicePreset(row);return preset?[preset]:[];}).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Saves the presets that changed and removes those that went, in one transaction, with the writer given: the person's,
 * or an Agent's in the call the Context entry admitted (the board). */
export function storeServicePresets(context:ContextWriter,before:readonly ServicePreset[],after:readonly ServicePreset[]){
 context.transaction(()=>{
  const save=after.filter(preset=>JSON.stringify(before.find(item=>item.id===preset.id))!==JSON.stringify(preset));
  const forget=before.filter(preset=>!after.some(item=>item.id===preset.id)).map(preset=>preset.id);
  if(save.length||forget.length)context.write('service-presets',{save:save as unknown as Row[],forget});
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
     storeServicePresets(contextWriter(ledgerContext(db),'person'),presets,saved.presets);
     return {presets:saved.presets,preset:saved.preset};
    }
    if(operation==='delete'){
     const next=removeServicePreset(presets,request.id);
     storeServicePresets(contextWriter(ledgerContext(db),'person'),presets,next);
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
