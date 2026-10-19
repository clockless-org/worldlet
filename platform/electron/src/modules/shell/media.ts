import {MEDIA,type MediaService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {MediaSurface} from './surface.ts';
import {killAll} from './io.ts';

/** The host-owned media surface the World's sound (world-audio), Fox's voice (voice) and Voice Memos
 * (applet-tools) share, plus the child processes and tools Python their helpers run. The surface outlives
 * the World page, so playback, capture and spoken replies keep going while it reloads. */
export function installMedia(host:Host){
 host.provide<MediaService>(MEDIA,{surface:new MediaSurface()});
}

/** Installed after the modules that use the surface: on quit they stop first, then their helpers end and the surface closes. */
export function installMediaClose(host:Host){
 const {surface}=host.use<MediaService>(MEDIA);
 host.onQuit(()=>{killAll();surface.close();});
}
