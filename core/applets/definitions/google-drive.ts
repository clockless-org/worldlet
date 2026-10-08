export default {
 id:'app-google-drive',key:'google-drive',title:'Google Drive',region:'work',version:1,
 description:'Browse recent files and read Google Docs text. Open the original website for other formats and editing.',
 purpose:'Fox finds your recent files and reads your Docs',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://drive.google.com/',platform:'web'}},
 content:{noun:['file','files']},
 scene:{template:'notes',color:'#819785',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'google-drive',capability:'connect'},
 support:{level:'building',acceptance:false}
};
