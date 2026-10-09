/** Stable build-time presentation API. Bump the major version for incompatible changes. */
export const BUILD_THEME_CONTRACT_VERSION = 1;
export interface ThemeItem {
 id:string; title:string; summary?:string; context?:string; start?:string; end?:string;
 local?:boolean; curated?:boolean; record?:Record<string,any>;
}
export interface ThemeAppletContext {
 host:HTMLElement;
 applet:{id:string;title:string};
 items:readonly Readonly<ThemeItem>[];
 data:{now?:number;sample?:boolean;connected?:boolean;reading?:boolean;error?:string;
  calendar?:{save:(record:Record<string,any>)=>Promise<void>|void;remove:(id:string)=>Promise<void>|void}};
 /** Opens an existing item through the host; IDs outside the supplied items are ignored. */
 openItem(id:string):void;
 invalidate():void;
 /** Host-owned full calendar/reader UI, including existing actions and data ownership. */
 renderDefault(target:HTMLElement):void;
}
export interface ThemeMount {dispose():void}
export interface BuildTheme {
 contractVersion:1;
 id:string;
 /** Return false for applets that should keep the host's standard renderer. */
 renderApplet(context:ThemeAppletContext):false|ThemeMount;
}
export interface BuildThemeManifest {
 contractVersion:1; id:string; version:string; title:string;
 /** All paths relative to this directory. Only this directory is copied. */
 entry:'entry.ts'; stylesheet:'theme.css'; assets:'assets';
 inherits:'village';
 hud:'shared'|'styled'; fonts:'shared'|'bundled'; buttons:'shared'|'styled';
 applets:string[];
}

export function parseBuildThemeManifest(value:unknown):BuildThemeManifest {
 const t=value as BuildThemeManifest;
 if(!t||t.contractVersion!==1||! /^[a-z][a-z0-9-]*$/.test(t.id)||!/^\d+\.\d+\.\d+$/.test(t.version)||typeof t.title!=='string'||!t.title.trim()||t.entry!=='entry.ts'||t.stylesheet!=='theme.css'||t.assets!=='assets'||t.inherits!=='village'||!['shared','styled'].includes(t.hud)||!['shared','bundled'].includes(t.fonts)||!['shared','styled'].includes(t.buttons)||!Array.isArray(t.applets)||t.applets.some(id=>typeof id!=='string'||! /^[a-z][a-z0-9-]*$/.test(id))||new Set(t.applets).size!==t.applets.length)throw Error('Invalid build theme manifest (contract v1)');
 return t;
}
