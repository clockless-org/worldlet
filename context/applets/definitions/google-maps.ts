// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
  fullView: {"kind": "web", "url": "https://www.google.com/maps/", "platform": "google-maps"},
  "id": "app-google-maps",
  "key": "google-maps",
  "title": "Google Maps",
  "region": "money",
  "description": "Browse places and routes in Google Maps. Personal saved places and Timeline are not synced.",
  "purpose": "Find places and routes; Fox can look them up for you",
  "version": 1,
  "scene": {
    "template": "map",
    "color": "#769b7c",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
