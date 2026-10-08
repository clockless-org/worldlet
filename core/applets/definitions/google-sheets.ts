export default {
 id:'app-google-sheets',key:'google-sheets',title:'Google Sheets',region:'work',version:1,
 description:'Read spreadsheet exports through your Drive connection. Open Web for editing and original formatting.',
 purpose:'Fox reads your Google Sheets',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://docs.google.com/spreadsheets/',platform:'web'}},
 content:{noun:['spreadsheet','spreadsheets']},
 scene:{template:'notes',color:'#819785',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'google-drive',capability:'connect'},
 support:{level:'building',acceptance:false}
};
