// Electron fuses for the packaged app, flipped in the Electron binary before packager signs it (on Mac, fuses written
// after signing would break the signature). scripts/mac-app-info-check.ts holds the values and the call site.
import path from 'node:path';
import {flipFuses,FuseV1Options,FuseVersion} from '@electron/fuses';

export const appFuses={
 // The World tool bridge runs this executable as Node (ELECTRON_RUN_AS_NODE, world-tool-bridge.ts), so it stays on.
 [FuseV1Options.RunAsNode]:true,
 // Nothing may inject code into the shipped app through NODE_OPTIONS or attach a Node inspector with --inspect.
 [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,
 [FuseV1Options.EnableNodeCliInspectArguments]:false,
} as const;

/** Flips appFuses in one packaged build. `buildPath` is packager's staging root for that architecture. On Mac the
 * framework's ad-hoc signature is restored when the host can (a universal build's slices are left alone: packager
 * merges them, re-signs the merged framework ad hoc after its integrity digest, and `--sign` signs it all again). */
export async function flipAppFuses(buildPath:string,platform:string,resetAdHocSignature:boolean){
 const executable=platform==='darwin'?path.join(buildPath,'Worldlet.app'):platform==='win32'?path.join(buildPath,'Worldlet.exe'):path.join(buildPath,'worldlet');
 await flipFuses(executable,{version:FuseVersion.V1,resetAdHocDarwinSignature:platform==='darwin'&&resetAdHocSignature,...appFuses});
}
