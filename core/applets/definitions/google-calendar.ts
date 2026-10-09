import type {AppletMotion} from '../../../contracts/world.ts';
// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
 attention:{version:1,provider:'google-calendar',reader:'native-calendar',intervalMinutes:30,freshnessMinutes:120} as const,
 motion:{version:2,kind:'sprite-frames',columns:3,rows:2,frames:6,fps:8,ambient:false} satisfies AppletMotion,
  content: {noun: ["event", "events"], hideTitle: true, statusText: "Connected · Read only", empty: "No events in your connected calendars in the next 30 days."},
  fullView: {kind: 'scene', original: {url: 'https://calendar.google.com/', platform: 'web'}},
  "id": "app-google-calendar",
  "key": "google-calendar",
  "title": "Calendar",
  "region": "home",
  "description": "Read your connected calendars. Access is requested only when you connect.",
  "purpose": "Fox keeps an eye on what’s coming up on your calendar",
  "version": 1,
  "scene": {
    "template": "calendar",
    "color": "#4c8bd9",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "native",
    "provider": "google-calendar",
    "capability": "connect"
  }
};
