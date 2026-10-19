import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import {afterGpuCrash,graphicsMode,type GraphicsMode,type GraphicsState} from '../../../agent/app/index.ts';

// Software graphics after a crashing GPU process (agent/app/graphics-mode.ts). The state lives in the library's
// logs/graphics.json, written at each GPU crash, so a run Chromium ends right after still counts at the next launch.
let current:GraphicsMode='hardware';
const file=(root:string)=>path.join(root,'logs','graphics.json');
function read(root:string):GraphicsState|null {try{return JSON.parse(fs.readFileSync(file(root),'utf8'));}catch{return null;}}

/** Before `ready`: a launch in software graphics turns hardware acceleration off and lets WebGL (the World) run on SwiftShader. */
export function startGraphics(root:string,now=Date.now()):GraphicsMode {
 current=graphicsMode(read(root),now);
 if(current==='software'){app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');}
 return current;
}
export const currentGraphics=()=>current;

/** A GPU process crash: kept at once; true when this run should restart into software graphics. */
export function graphicsCrashed(root:string,now=Date.now()):boolean {
 const {state,fallback}=afterGpuCrash(read(root),now,current);
 try{fs.mkdirSync(path.dirname(file(root)),{recursive:true});fs.writeFileSync(file(root),JSON.stringify(state),{mode:0o600});}catch{return false;}
 return fallback;
}
