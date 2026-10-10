import type {AppletMotion} from '../../../contracts/world.ts';
// Not an account Applet. The forecast, refresh and staleness rules already run in
// Weather.swift and ui/world/world-environment.ts; this gives that data a body.
export default {
 attention:{version:1,provider:'weather',reader:'observation',intervalMinutes:30,freshnessMinutes:120} as const,
 motion:{version:2,kind:'sprite-frames',columns:3,rows:2,frames:6,fps:8,ambient:false} satisfies AppletMotion,
  fullView: {kind: 'scene'},
  "id": "app-weather",
  "key": "weather",
  "title": "Weather",
  "region": "home",
  "description": "The sky you are actually under, on the ground where you live.",
  "purpose": "Today’s weather and the week ahead where you live",
  "version": 1,
  "scene": {
    "template": "vane",
    "color": "#8fb4c9",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "none",
    "provider": null,
    "capability": "local"
  }
};
