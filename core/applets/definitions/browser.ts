// A face and a position for the embedded browser that already exists, not a new
// capability: somewhere to open a page that has no Applet of its own.
export default {
  fullView: {"kind": "web", "url": "https://www.google.com/", "platform": "web"},
  "id": "app-browser",
  "key": "browser",
  "title": "Browser",
  "region": "home",
  "description": "Look something up. Anywhere on the web that does not have an Applet yet.",
  "purpose": "Visit any website; Fox can look things up for you",
  "version": 1,
  "scene": {
    "template": "portal",
    "color": "#6f8c86",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "browser",
    "provider": null,
    "capability": "browser"
  }
};
