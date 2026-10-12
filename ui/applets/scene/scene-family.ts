import {themeAppletScene} from '../../themes/index.ts';
/**
 * Which painted scene an Applet borrows when the theme has none of its own. A theme paints scenes keyed by Applet
 * (gmail, google-calendar) and a few kept for a kind of Applet (music, files, maps). The host, not the theme, says which
 * kind each Applet is, so a theme only paints pictures and a new Applet needs one line here, never a theme change.
 * An Applet in no family, or whose family the theme did not paint, keeps the host's default (the Browser scene for a
 * website, plain paper for a scene Applet).
 */
const FAMILIES:Record<string,readonly string[]>={
 gmail:['outlook'],
 meetings:['zoom','teams'],
 messages:['whatsapp','telegram','slack','feishu','discord'],
 contacts:['linkedin','facebook'],
 music:['spotify','apple-music'],
 podcasts:['apple-podcasts'],
 photos:['google-photos','instagram','pinterest'],
 maps:['google-maps','airbnb','tripit','booking','uber'],
 news:['reddit','wikipedia','x','threads'],
 stocks:['stripe','paypal','plaid','alipay'],
 clock:['todoist','linear','jira'],
 files:['google-drive','google-docs','google-sheets','google-slides','dropbox','onedrive','baidu-netdisk','microsoft-word','microsoft-excel','microsoft-powerpoint','acrobat','notion','obsidian','github','gitlab','codex','claude-code','supabase','docker'],
 'random-game':['wordle','nyt-connections','slither-io','agar-io','krunker-io','skribbl-io','infinite-craft','little-alchemy-2','cookie-clicker','lichess','drive-mad','subway-surfers','pokemon-showdown','sekai','sekai-rogue-ai-tic-tac-toe','sekai-sketch-racer','sekai-mixing-colors','sekai-roller-coaster','sekai-3d-uno','sekai-devil-level'],
};
const FAMILY=new Map(Object.entries(FAMILIES).flatMap(([scene,keys])=>keys.map(key=>[key,scene] as const)));
/** The theme scene key `appletKey` draws in: its own, else its family's, else undefined when the theme painted neither. */
export function appletSceneKey(appletKey:string):string|undefined{
 if(themeAppletScene(appletKey))return appletKey;
 const family=FAMILY.get(appletKey);return family&&themeAppletScene(family)?family:undefined;
}
