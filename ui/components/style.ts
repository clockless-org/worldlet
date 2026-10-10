import {ACTIVE_THEME} from '../themes/index.ts';

// The active theme's Style Pack (ui/themes). No filesystem, account, URL or user override lookup.
const {manifest,tokens}=ACTIVE_THEME.style;
export const BUILTIN_STYLE=manifest;
export const STYLE_TOKENS=tokens;
export const BUILTIN_STYLE_REF=Object.freeze({id:manifest.id,version:manifest.version});
export function assertBuiltinStyle(ref:unknown){
 const value=ref as typeof BUILTIN_STYLE_REF;
 if(!value||value.id!==manifest.id||value.version!==manifest.version)throw Error('Unsupported built-in style');
}
export function appletStyle(key:string):{peek:string;open?:string;focus?:string;motion?:string}{
 if(!Object.hasOwn(manifest.applets,key))throw Error('Missing built-in Applet presentation: '+key);
 return manifest.applets[key];
}

