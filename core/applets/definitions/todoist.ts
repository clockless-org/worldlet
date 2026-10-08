export default {
 id:'app-todoist',key:'todoist',title:'Todoist',region:'work',version:1,
 description:'Read active tasks and review completion with Fox through the official Todoist connection. Open the website for other edits.',
 purpose:'Fox reads your tasks and helps you get them done',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://app.todoist.com/',platform:'web'}},
 content:{noun:['task','tasks']},
 scene:{template:'notes',color:'#b96550',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'todoist',capability:'connect'},
 support:{level:'building',acceptance:false}
};
