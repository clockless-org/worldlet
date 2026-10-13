// Check launches on a computer someone may be looking at: the release hosts (Alpha and Beta on the Mac and Windows) and a
// stand-in on someone's own Mac set WORLDLET_BACKGROUND_WINDOWS=1, and a development build, a release build on the RC
// harness's disposable library, or a Windows release on a named smoke profile then stays out of the way. Its windows
// appear without activating the app or taking focus; on the Mac it also has no Dock icon or menu bar (accessory) and its
// windows sit just below every ordinary window, so whatever is open on that screen stays in front. They still render
// (backgroundThrottling is off, Windows occlusion tracking is off, and on the Mac a window other windows cover whole is
// not treated as occluded), so captures and WebGL work.
// A release build launched by a person never reads it.
import {app,type BaseWindow} from 'electron';
import type {Profile} from './profile.ts';
type LaunchProfile=Pick<Profile,'channel'|'rcCheck'|'smokeProfile'>;
let on=false;
/** Whether this launch runs in the background; readable before `ready`, for command-line switches. */
export const backgroundLaunchWanted=(profile:LaunchProfile,env=process.env)=>
 (process.platform==='darwin'||process.platform==='win32')&&env.WORLDLET_BACKGROUND_WINDOWS==='1'&&(profile.channel==='dev'||profile.rcCheck===true||profile.smokeProfile===true);
export function startBackgroundLaunch(profile:LaunchProfile,env=process.env){
 on=backgroundLaunchWanted(profile,env);
 if(on&&process.platform==='darwin')app.setActivationPolicy('accessory');
 return on;
}
export const backgroundLaunch=()=>on;
/** Shows a window the background way: inactive, and on the Mac one level below ordinary windows. */
export function showInBackground(window:BaseWindow){
 if(process.platform==='darwin')window.setAlwaysOnTop(true,'normal',-1);
 window.showInactive();
}
