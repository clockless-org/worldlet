export default {
  fullView: {"kind": "web", "url": "https://cloud.ouraring.com/", "platform": "web"},
  "id": "app-oura",
  "key": "oura",
  "title": "Oura Ring",
  "region": "money",
  "description": "Browse your Oura account website. Sleep and readiness data are not synced.",
  "purpose": "Check your sleep and readiness on Oura’s website",
  "version": 1,
  "scene": {
    "template": "ring-charger",
    "color": "#8296a8",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
