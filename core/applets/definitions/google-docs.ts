export default {
 id:'app-google-docs',key:'google-docs',title:'Google Docs',region:'work',version:1,
 description:'Read document exports through your Drive connection. Open Web for editing and original formatting.',
 purpose:'Fox reads your Google Docs',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://docs.google.com/document/',platform:'web'}},
 content:{noun:['document','documents']},
 scene:{template:'notes',color:'#819785',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'google-drive',capability:'connect'},
 support:{level:'building',acceptance:false}
};
