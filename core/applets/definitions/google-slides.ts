export default {
 id:'app-google-slides',key:'google-slides',title:'Google Slides',region:'work',version:1,
 description:'Read presentation exports through your Drive connection. Open Web for editing and original formatting.',
 purpose:'Fox reads your Google Slides',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://docs.google.com/presentation/',platform:'web'}},
 content:{noun:['presentation','presentations']},
 scene:{template:'notes',color:'#819785',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'google-drive',capability:'connect'},
 support:{level:'building',acceptance:false}
};
