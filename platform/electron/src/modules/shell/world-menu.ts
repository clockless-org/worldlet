import type {MenuItemConstructorOptions} from 'electron';
import {core} from '../../core.ts';
import {canBuild,type WorldStore} from '../../store/world-store.ts';

export interface WorldMenuState {importFiles:boolean;generate:boolean;readConnectedApps:boolean}
export interface WorldMenuActions {importFiles():void;generate():void;readConnectedApps():void}

/** Shared Core decides enablement from the same facts the World UI uses. */
export function worldMenuState(store:WorldStore):WorldMenuState {
 return core<WorldMenuState>('worldMenuState',{
  writable:store.writable,sample:store.sampleEnabled(),busy:store.busy,organizing:store.organizing,
  cloudConsent:store.state.cloudConsent===true,
  sources:store.state.sources.filter(s=>s.enabled!==false).length,connections:store.state.connections.filter(canBuild).length
 });
}

/** The Mac `CommandMenu("World")`: native labels, each disabled when its action is not allowed. */
export function worldMenu(state:WorldMenuState,actions:WorldMenuActions):MenuItemConstructorOptions {
 return {label:'World',submenu:[
  {label:'Import files…',accelerator:'CommandOrControl+O',enabled:state.importFiles,click:()=>actions.importFiles()},
  {label:'Generate my world',enabled:state.generate,click:()=>actions.generate()},
  {label:'Read connected apps',enabled:state.readConnectedApps,click:()=>actions.readConnectedApps()}
 ]};
}
