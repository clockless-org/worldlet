import type {UICommand,UISnapshot} from '../../contracts/ui.ts';
/** Revalidate against current targets, never trust stale Agent IDs or coordinates. */
export function validateUICommand(value:unknown,state:UISnapshot):UICommand {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid UI command.');
 const command=value as Record<string,unknown>;
 if(command.version!==1)throw Error('Unsupported UI contract version.');
 if(command.action==='back'||command.action==='overview'){
  if(Object.keys(command).some(k=>!['version','action'].includes(k)))throw Error('Unexpected UI command field.');
  return {version:1,action:command.action};
 }
 if(command.action==='activate'&&typeof command.id==='string'&&state.targets.some(target=>target.id===command.id)){
  if(Object.keys(command).some(k=>!['version','action','id'].includes(k)))throw Error('Unexpected UI command field.');
  return {version:1,action:'activate',id:command.id};
 }
 throw Error('UI action unavailable. Inspect the current interface first.');
}
