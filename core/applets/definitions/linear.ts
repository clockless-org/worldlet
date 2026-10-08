export default {
 id:'app-linear',key:'linear',title:'Linear',region:'work',version:1,
 description:'Read your issues through the official Linear connection. Open the website to create or edit issues.',
 purpose:'Fox reads your Linear issues',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://linear.app/',platform:'web'}},
 content:{noun:['issue','issues']},
 scene:{template:'notes',color:'#5e6ad2',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'linear',capability:'connect'},
 support:{level:'building',acceptance:false}
};
