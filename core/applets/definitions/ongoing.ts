// Ongoing (core/ongoing/README.md): conversations brought from other Agents that the person made into Applets,
// such as an OpenClaw channel or a long Claude Code session they keep coming back to. Each kept one is a device of
// its own (core/ongoing ongoingApplet) wearing this entry's art and opening its panel. Nothing here reads an account.
export default {
 // Brought conversations active lately are Attention context (core/ongoing/attention.ts): the open loops in them
 // reach the Center. A week's freshness, renewed every hour while they stay recent.
 attention:{version:1,provider:'conversations',reader:'observation',intervalMinutes:60,freshnessMinutes:10080} as const,
 id:'app-ongoing',key:'ongoing',title:'Ongoing',region:'work',version:1,
 description:'Things you keep working on with your other Agents: an OpenClaw channel, a long Claude Code session. Fox suggests them after you bring an Agent; each one you keep gets a place here and on your phone.',
 purpose:'Keep the conversations you keep coming back to in one place',
 fullView:{kind:'panel'},scene:{template:'device',color:'#4f7a6a',renderer:'painted-device',version:1},
 connection:{kind:'none',provider:null,capability:'local'},
 content:{activity:'Following'},
 // Never placed itself: each kept thing stands as its own device.
 installByDefault:false
};
