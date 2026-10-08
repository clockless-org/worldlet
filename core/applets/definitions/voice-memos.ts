export default {
 requiresHostFeature:'voiceMemos' as const,
 id:'app-voice-memos',key:'voice-memos',title:'Voice Memos',region:'work',version:1,
 description:'Listen to Apple Voice Memos recordings on this Mac.',
 purpose:'Listen to your Voice Memos recordings in your world',
 scene:{template:'recorder',color:'#aa695c',renderer:'preset-device',version:1},
 connection:{kind:'native',provider:'voice-memos',capability:'connect',flow:'in-applet'},
 fullView:{kind:'scene'},content:{noun:['recording','recordings'],empty:'Connect Voice Memos with Fox.'}
};
