export default {
  fullView: {"kind": "web", "url": "https://my.plaid.com/", "platform": "web"},
  "id": "app-plaid",
  "key": "plaid",
  "title": "Plaid",
  "region": "money",
  "description": "Browse your Plaid account website. Bank data is not imported into Worldlet.",
  "purpose": "Open your Plaid account on its website",
  "version": 1,
  "scene": {
    "template": "strongbox",
    "color": "#759f99",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "embedded-browser",
    "provider": null,
    "capability": "browser"
  }
};
