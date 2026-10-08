export default {
 id:'app-supabase',key:'supabase',title:'Supabase',region:'work',version:1,
 description:'Read project status and region through the official Supabase connection. Use Web for database content and editing.',
 purpose:'Fox checks on your Supabase projects',
 focusPresentation:'world-device',installByDefault:false,requiresHostFeature:'curatedSourceRead' as const,
 fullView:{kind:'scene',original:{url:'https://supabase.com/dashboard',platform:'web'}},
 content:{noun:['project','projects']},
 scene:{template:'notes',color:'#b96550',renderer:'painted-device',version:1},
 connection:{kind:'hermes',provider:'supabase',capability:'connect'},
 support:{level:'building',acceptance:false}
};
