export default {
  fullView: {"kind": "web", "url": "https://www.fitbit.com/", "platform": "web"},
  "id": "app-fitbit",
  "key": "fitbit",
  "title": "Fitbit",
  "region": "money",
  "description": "The ordinary watch on an ordinary wrist: steps, sleep and heart rate.",
  "purpose": "Check your steps, sleep and heart rate on Fitbit’s website",
  "version": 1,
  "scene": {
    "template": "watch",
    "color": "#00b0b9",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
