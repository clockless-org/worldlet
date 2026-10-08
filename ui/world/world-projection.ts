import {sourceContextRows,compileWorld} from '../../core/context/index.ts';
import {projectWorldItems} from '../../core/items/index.ts';
import type {World} from '../../contracts/world.ts';
import {applyPersonalWorld} from './world-presets.ts';
import {applyModuleWorld} from './world-modules.ts';
import {attachBrowserDevice} from './browser-sample.ts';
import {ongoingApplet,readOngoing} from '../../core/ongoing/index.ts';
import {isMyApplet,momentApplet,readSiteApplet,siteApplet} from '../../core/applets/index.ts';

/** Data-only World presentation projection. No DOM, storage or Host access. */
export function projectNativeWorld(state):World{
 const world:World=compileWorld({id:state.workspaceId,name:'My world',revision:state.revision},sourceContextRows(state));
 world.native=true;world.hiddenApplets=state.onboarding?.hiddenApplets;world.appletPositions=state.onboarding?.appletPositions;world.unlockedApplets=state.onboarding?.unlockedApplets;world.regionLayout=state.onboarding?.regionLayout;
 if(world.unlockedApplets&&!state.onboarding?.completed)world.unlockedApplets=world.unlockedApplets.filter(id=>id!=='app-google-calendar');
 if(world.unlockedApplets&&!state.onboarding?.completed&&!state.onboarding?.mailStarted&&(state.onboarding?.introStep||0)<2)world.unlockedApplets=[];
 world.workspace='Worldlet';world.coverage.scope='Connected apps are read on demand. Your selected Agent manages execution; memory follows its declared ownership.';
 for(const s of world.spaces){const place=state.layout?.places.find(p=>p.theme===s.theme);if(place){s.layout=place;s.title=place.title;}}
 applyPersonalWorld(world,state);projectWorldItems(world,state.worldItems||[]);
 world.taskReviews=Array.isArray(state.taskReviews)?state.taskReviews:[];
 // Conversations the person kept as ongoing things are Applets of their own (core/ongoing/README.md).
 world.dynamicApplets=(Array.isArray(state.ongoing)?state.ongoing:[]).flatMap(row=>{const thing=readOngoing({...row,state:'kept'});return thing?[ongoingApplet(thing)]:[];});
 // So is each Applet Fox made for a moment that is now (core/widgets/README.md).
 world.dynamicApplets.push(...(Array.isArray(state.momentApplets)?state.momentApplets:[]).map(momentApplet));
 // And each website the person made an Applet of from the Browser (core/applets/site-applet.ts).
 world.dynamicApplets.push(...(Array.isArray(state.siteApplets)?state.siteApplets:[]).flatMap(row=>{const record=readSiteApplet(row);return record?[siteApplet(record)]:[];}));
 // The person's own Applets wear the icon painted for them on this computer, when there is one (core/applets/MY-APPLETS.md#pictures).
 const painted=state.appletArt&&typeof state.appletArt==='object'?state.appletArt:{};
 for(const app of world.dynamicApplets){const icon=painted[app.id];if(isMyApplet(app)&&typeof icon==='string'&&icon.startsWith('data:image/'))app.icon=icon;}
 return applyModuleWorld(attachBrowserDevice(world));
}
