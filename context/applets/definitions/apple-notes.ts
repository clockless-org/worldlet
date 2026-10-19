import type {AppletMotion} from '../../../contracts/world.ts';
export default {
 requiresHostFeature:'appleNotes' as const,
 attention:{version:1,provider:'apple-notes',reader:'source-reader',intervalMinutes:30,freshnessMinutes:1440} as const,
 motion:{version:2,kind:'sprite-frames',columns:3,rows:2,frames:6,fps:8,ambient:false} satisfies AppletMotion,
  // Notes is read directly from the local Notes app. Its contents unfold in the
  // world; there is no iCloud website fallback in the normal path.
  fullView: {kind: 'scene'},
  "id": "app-apple-notes",
  "key": "apple-notes",
  "title": "Notes",
  "region": "home",
  "description": "Read up to 50 notes in Notes order on this Mac. Locked notes and attachments are not imported.",
  "purpose": "Fox reads your notes on this Mac to help with your day",
  "version": 1,
  "scene": {
    "template": "notebook",
    "color": "#d7b958",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "native",
    "provider": "apple-notes",
    "capability": "connect"
  }
};
