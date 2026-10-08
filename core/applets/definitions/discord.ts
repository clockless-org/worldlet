// Website-only Applet. Login and message state belong to Discord, not a connector.
export default {
  id: 'app-discord',
  key: 'discord',
  title: 'Discord',
  region: 'library',
  description: 'Chat with your communities in Discord. Sign in on the website; messages and unread counts are not synced to Worldlet.',
  purpose: 'Chat with your communities on Discord’s website',
  version: 1,
  fullView: {kind: 'web', url: 'https://discord.com/app', platform: 'web'},
  scene: {template: 'voice-room', color: '#5865f2', renderer: 'preset-device', version: 1},
  connection: {kind: 'embedded-browser', provider: null, capability: 'browser'}
};
