import {createStripeApplet} from './stripe/panel.ts';
import {createYouTubeApplet} from './youtube/panel.ts';
import {createDoorDashApplet} from './doordash/panel.ts';
import {createMomentApplet} from './moment/panel.ts';
import {createOngoingApplet} from './ongoing/panel.ts';

// Full View panels owned by their Applet. The world view mounts them by the
// catalog's fullView.kind ('panel' fills the content pane, 'scene' returns a
// foreground body) and never names an Applet. Every factory receives the same
// context and picks what it needs.
const PANELS={stripe:createStripeApplet,youtube:createYouTubeApplet,doordash:createDoorDashApplet,moment:createMomentApplet,ongoing:createOngoingApplet};
export function createAppletPanel(key,context){return PANELS[key]?.(context)??null;}
