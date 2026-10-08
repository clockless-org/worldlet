export default {
 requiresHostFeature:'messages' as const,
 id:'app-messages',key:'messages',title:'Messages',region:'library',version:1,
 description:'Read your conversations and send iMessages from Messages on this Mac.',
 purpose:'Read your iMessage conversations and send messages from your world',
 // The painted speech-bubble intercom (resources/styles/builtin/assets/applets/messages) over the Messages icon.
 scene:{template:'device',color:'#6fae6a',renderer:'painted-device',version:1},
 connection:{kind:'native',provider:'messages',capability:'connect',flow:'in-applet'},
 fullView:{kind:'scene'},content:{noun:['conversation','conversations'],empty:'Open Messages to read your conversations.'}
};
