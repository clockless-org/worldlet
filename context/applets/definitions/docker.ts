export default {
 id:'app-docker',key:'docker',title:'Docker',region:'work',version:1,
 description:'Read local container status and image details using the installed Docker CLI.',
 purpose:'Fox checks your local containers and images',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene'},content:{noun:['container','containers'],empty:'No local containers.'},
 scene:{template:'device',color:'#7198a3',renderer:'painted-device',version:1},
 connection:{kind:'local-cli',provider:'docker',capability:'read'},
 support:{level:'building',acceptance:false}
};
