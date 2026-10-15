// App-owned identity, visual recipe and connection declaration. No credentials or user data.
export default {
 attention:{version:1,provider:'github',reader:'source-reader',intervalMinutes:15,freshnessMinutes:1440} as const,
  fullView:{kind:'web',url:'https://github.com/',platform:'web'},
  "id": "app-github",
  "key": "github",
  "title": "GitHub",
  "region": "work",
  "description": "Follow code, reviews and releases in one place.",
  "purpose": "Fox follows your pull requests, reviews and releases",
  "version": 1,
  "scene": {
    "template": "repository",
    "color": "#465365",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "hermes",
    "provider": "github",
    "capability": "connect"
  }
};
