/** The Village's own settings, copied from the built-in theme pack (resources/themes/village/theme.json) and style
 * tokens (resources/styles/builtin/tokens.json) so the Village World reads nothing of the host's theme registry.
 * scripts/theme-pack-check.ts keeps them equal to those files. */
/** Where an opened Applet's device stands, as fractions of the window. */
export const ROOM_FOREGROUND:readonly [number,number]=[.835,.52];
/** The scenery's colour grade; Applets and the HUD are never graded. */
export const SCENERY_TONE={saturation:-.18,contrast:-.16} as const;
/** A painted feature in a device image, before any crop or scaling (ThemeDeviceFeature). */
export type DeviceFeature={center:[number,number];radius:[number,number]};
export type DeviceEffects={lamp?:DeviceFeature;idle?:DeviceFeature&{kind:'orbit'|'bubbles'|'writing'|'glow'|'glint';color:string}};
type Rect=[number,number,number,number];
export type MailDelivery={src:string;bounds:Rect;duration:number;shadow:{bounds:Rect;contact:[number,number]};foreground:Rect[]};
