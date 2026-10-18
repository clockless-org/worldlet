export default {
  fullView: {kind: "scene"},
  "id": "app-obsidian",
  "key": "obsidian",
  "title": "Obsidian",
  "region": "work",
  "description": "A vault is a folder of Markdown files; point Worldlet at it and it reads, never writes.",
  "purpose": "Fox reads your Obsidian vault; it never changes it",
  "version": 1,
  "scene": {
    "template": "vault-notes",
    "color": "#7c6ce0",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "native",
    "provider": "obsidian",
    "capability": "connect"
  }
};
