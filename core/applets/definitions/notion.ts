// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
 attention:{version:1,provider:'notion',reader:'source-reader',intervalMinutes:30,freshnessMinutes:1440} as const,
  content: {noun: ["page", "pages"]},
  fullView: {kind: "scene", original: {url: "https://www.notion.so/login", platform: "web"}},
  "id": "app-notion",
  "key": "notion",
  "title": "Notion",
  "region": "work",
  "description": "Use your notes and documents across your world.",
  "purpose": "Fox reads your Notion pages and finds what matters",
  "version": 1,
  "scene": {
    "template": "notes",
    "color": "#526258",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "hermes",
    "provider": "notion",
    "capability": "connect"
  }
};
