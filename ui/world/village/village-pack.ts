import {themeData} from '../../themes/index.ts';
/** Where an opened Applet's device stands, as fractions of the window (the Village theme package's pack.json). */
export const ROOM_FOREGROUND=themeData<{layout:{room:{foreground:[number,number]}}}>('pack.json').layout.room.foreground as readonly [number,number];
/** The scenery's colour grade (tokens.json); Applets and the HUD are never graded. */
export const SCENERY_TONE=themeData<{sceneryTone:{saturation:number;contrast:number}}>('tokens.json').sceneryTone;
/** A painted feature in a device image, before any crop or scaling (ThemeDeviceFeature). */
export type DeviceFeature={center:[number,number];radius:[number,number]};
export type DeviceEffects={lamp?:DeviceFeature;idle?:DeviceFeature&{kind:'orbit'|'bubbles'|'writing'|'glow'|'glint';color:string}};
type Rect=[number,number,number,number];
export type MailDelivery={src:string;bounds:Rect;duration:number;shadow:{bounds:Rect;contact:[number,number]};foreground:Rect[]};
