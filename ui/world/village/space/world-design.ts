import opticalScales from './applet-optical-scales.json' with {type:'json'};
// Shared logical design coordinates. Texture pixels and devicePixelRatio do not
// change layout. Positions persist as normalized 0–1 anchors across asset sizes.
export const WORLD_DESIGN = Object.freeze({width:1920,height:1080});
export const WORLD_WIDTH = WORLD_DESIGN.width;
export const WORLD_HEIGHT = WORLD_DESIGN.height;

// Applet texture-box width in the 1920 × 1080 overview, before window scaling.
// Convert through the reference camera so surrounding terrain does not change it.
export const APPLET_OVERVIEW_WIDTH = 72;

// Optical corrections for device sprites: equally sized texture boxes can have very
// different solid visual mass. Open/Focus retains its layout size and the same relative optical correction.
export const APPLET_OPTICAL_SCALE: Readonly<Record<string,number>> = Object.freeze(opticalScales);
