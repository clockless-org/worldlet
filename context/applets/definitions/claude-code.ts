import type {AppletMotion} from '../../../contracts/world.ts';
export default {
 motion:{version:1,kind:'painted-rig',idle:.1,hover:.65,speed:1,joints:[{x:.39,y:.41,radius:.14,dx:.012,dy:.02,phase:1},{x:.65,y:.49,radius:.1,dx:-.012,dy:.02,phase:-1}]} satisfies AppletMotion,
  fullView: {kind:'scene'},
 id:'app-claude-code',key:'claude-code',title:'Claude Code',region:'work',version:1,
 description:'Browse local Claude Code sessions and read saved conversations. Live execution remains in Claude Code.',
 purpose:'Browse your Claude Code sessions and past conversations',
 scene:{template:'code',color:'#c78363',renderer:'preset-device',version:1},
 sessionProvider:'claude',
 connection:{kind:'local',provider:null,capability:'local'}
};
