// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
 attention:{version:1,provider:'gmail',reader:'source-reader',intervalMinutes:30,freshnessMinutes:1440} as const,
  content: {noun: ["message", "messages"], hideTitle: true, statusText: "Connected · Read only"},
  fullView: {kind: 'scene', original: {url: 'https://mail.google.com/mail/u/0/', platform: 'web'}},
  "id": "app-gmail",
  "key": "gmail",
  "title": "Mail",
  "region": "home",
  "description": "Bring your messages into the things you are working on.",
  "purpose": "Fox reads and sorts your mail and drafts replies",
  "version": 1,
  "scene": {
    "template": "mail",
    "color": "#d35b4d",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "hermes",
    "provider": "gmail",
    "capability": "connect"
  }
};
