// Check launches on a Mac someone is working at (a stand-in release host, scripts/release-hosts.mjs): the
// RC sets WORLDLET_BACKGROUND_WINDOWS=1, and a development build, or a release build on the RC harness's
// disposable library, then stays off the person's way. It has no Dock icon or menu bar (accessory), and its
// windows appear without activating the app or taking focus. They still render, so captures and WebGL work.
// A release build launched by a person never reads it.
import {app} from 'electron';
import type {Profile} from './profile.ts';
let on=false;
export function startBackgroundLaunch(profile:Pick<Profile,'channel'|'rcCheck'>,env=process.env){
 on=process.platform==='darwin'&&env.WORLDLET_BACKGROUND_WINDOWS==='1'&&(profile.channel==='dev'||profile.rcCheck===true);
 if(on)app.setActivationPolicy('accessory');
 return on;
}
export const backgroundLaunch=()=>on;
