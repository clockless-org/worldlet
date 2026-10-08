import type {UICommand,UISnapshot,WorldUI} from '../../contracts/ui.ts';
import {validateUICommand} from '../../core/tools/index.ts';
/** CDP can inspect this semantic interface even when the world is a Pixi canvas.
 * Navigation uses the exact handlers used by mouse/keyboard. Privileged actions
 * remain in the existing authorized tool gateway, not this navigation API. */
export function createWorldUI(snapshot:()=>UISnapshot,run:(command:UICommand)=>unknown):WorldUI {
 return Object.freeze({version:1 as const,snapshot:()=>structuredClone(snapshot()),async dispatch(value:UICommand){
  return run(validateUICommand(value,snapshot()));
 }});
}
