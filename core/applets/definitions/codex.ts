import type {AppletMotion} from '../../../contracts/world.ts';
export default {
 motion:{version:1,kind:'painted-rig',idle:.1,hover:.65,speed:1,joints:[{x:.25,y:.38,radius:.14,dx:.012,dy:.02,phase:1},{x:.69,y:.47,radius:.13,dx:-.012,dy:.02,phase:-1}],rollers:[{x:.225,y:.61,radius:.016},{x:.352,y:.648,radius:.017},{x:.414,y:.668,radius:.017},{x:.479,y:.694,radius:.017},{x:.541,y:.715,radius:.017},{x:.600,y:.746,radius:.018}]} satisfies AppletMotion,
  fullView: {kind:'scene'},
 id:'app-codex',key:'codex',title:'Codex',region:'work',version:1,
 description:'Explore Codex sessions, read conversations and continue coding with Fox.',
 purpose:'Read your Codex sessions and keep coding with Fox',
 scene:{template:'code',color:'#6f889d',renderer:'codex-studio',version:1},
 sessionProvider:'codex',
 connection:{kind:'local',provider:null,capability:'local'}
};
