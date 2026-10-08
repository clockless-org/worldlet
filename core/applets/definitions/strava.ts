// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
  fullView: {"kind": "web", "url": "https://www.strava.com/dashboard", "platform": "web"},
  "id": "app-strava",
  "key": "strava",
  "title": "Strava",
  "region": "money",
  "description": "Browse your Strava dashboard. Activity records are not synced.",
  "purpose": "Check your runs and rides on Strava’s website",
  "version": 1,
  "scene": {
    "template": "activity",
    "color": "#d98653",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
