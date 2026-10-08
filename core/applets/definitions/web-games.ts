import type {AppletDefinition} from '../../../contracts/world.ts';
import entries from '../web-games.json' with {type:'json'};
// Popular games that already live on the web, free to play without an account:
// each Applet opens the publisher's own page (Website Applet) and reads nothing.
// web-games.json says why each one is here (its popularity); the sprite is the
// gameplay-specific miniature art (assets/applets/<key>/provenance.json).
export const WEB_GAME_APPLETS:readonly AppletDefinition[]=entries.map(app=>({
 id:'app-'+app.key,key:app.key,title:app.title,region:'health',version:1,description:app.description,purpose:app.description,
 installByDefault:false,focusPresentation:'world-device',
 fullView:{kind:'web',url:app.url,platform:'web'},
 scene:{template:'device',color:app.color,renderer:'painted-device',version:1},
 connection:{kind:'embedded-browser',provider:null,capability:'browser'},
 content:{activity:'Playing'},
 support:{level:'launch-only',acceptance:false},
 source:app.source
}));
