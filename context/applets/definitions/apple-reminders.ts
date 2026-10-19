import type {AppletMotion} from '../../../contracts/world.ts';
export default {
 requiresHostFeature:'appleReminders' as const,
 attention:{version:1,provider:'apple-reminders',reader:'source-reader',intervalMinutes:30,freshnessMinutes:1440} as const,
 motion:{version:2,kind:'sprite-frames',columns:3,rows:2,frames:6,fps:8,ambient:false} satisfies AppletMotion,
  // Reminders is read through EventKit on this Mac. It opens as an in-world
  // selectable stage rather than loading iCloud in a browser.
  fullView: {kind: 'scene'},
  "id": "app-apple-reminders",
  "key": "apple-reminders",
  "title": "Reminders",
  "region": "home",
  "description": "Read your reminders on this Mac. System access is requested only when you connect.",
  "purpose": "Fox reads your reminders and brings up the ones due",
  "version": 1,
  "scene": {
    "template": "reminders",
    "color": "#d9ab53",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "native",
    "provider": "apple-reminders",
    "capability": "connect"
  }
};
