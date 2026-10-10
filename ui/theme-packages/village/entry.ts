import type {BuildTheme} from '@worldlet/theme';
import {renderVillageWorld} from './village-world.ts';
/** The Village: the animated Pixi World. Its Applets open in the host's own Applet pages (theme.json `appletPages`). */
const theme:BuildTheme={contractVersion:2,id:'village',renderWorld:renderVillageWorld,
 renderApplet(){throw Error('The Village opens Applets in the host\'s own pages');}};
export default theme;
