// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
  fullView: {"kind": "web", "url": "https://x.com/home", "platform": "x"},
  "id": "app-x",
  "key": "x",
  "title": "X",
  "region": "library",
  "description": "Read X and keep useful posts with Fox.",
  "purpose": "Read X; Fox keeps the useful posts for you",
  "version": 1,
  "scene": {
    "template": "post",
    "color": "#394c48",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
