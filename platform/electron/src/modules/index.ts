import type {Host} from '../host/types.ts';
import {installWorld} from './world.ts';
import {installFox} from './fox/index.ts';
import {installAttention} from './attention/index.ts';
import {installAgentRuntime} from './agent-runtime/index.ts';
import {installShell} from './shell/index.ts';
import {installSources} from './sources/index.ts';
import {installMedia} from './media/index.ts';
import {installBrowser} from './browser/index.ts';
import {installPhone} from './phone/index.ts';
import {installGames} from './games/index.ts';
import {installWidgets} from './artifacts/widgets.ts';
import {installOngoing} from './tasks/index.ts';
import {installArtifacts} from './artifacts/index.ts';
import {installSiteApplets} from './browser/site-applets.ts';
import {installCalendar} from './calendar/index.ts';
import {installAppletArt} from './applet-art/index.ts';
/** Every host domain, installed in order. Each registers its own actions and services. */
export const modules:((host:Host)=>void)[]=[installWorld,installFox,installAttention,installAgentRuntime,installShell,installSources,installMedia,installBrowser,installPhone,installGames,installWidgets,installOngoing,installArtifacts,installSiteApplets,installCalendar,installAppletArt];
