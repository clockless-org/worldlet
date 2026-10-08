// Video formats the standard CEF build cannot play (#1174), and when a website page shows it needs
// them. Website pages run on CEF without H.264/AAC; Electron's own views play them. A page that
// needs them moves to Electron's views by itself (owner Order 2026-10-07: 越自动越好), the general
// form of the X, Douyin and Twitch Applets that always run there (ELECTRON_VIEW_APPLETS).
// The page side (platform/bridge/video-formats.js) only counts; this rule decides.

/** Media types that need proprietary codecs: H.264/AVC, HEVC, AAC, MPEG-4 and Dolby audio, and
 * HLS, which carries them. The page script is installed with this pattern's source. */
export const PROPRIETARY_VIDEO=/\b(avc1|avc3|hvc1|hev1|mp4a|mp4v|ac-3|ec-3)\b|mpegurl/i;

export const VIDEO_FORMATS={
 /** How long after the page was first refused a proprietary format, with nothing played, before it
  * counts as needing one: a site that falls back to VP9 or AV1 (YouTube) has used it by then. */
 settleMs:5000,
 /** Sites remembered as needing them, so their pages open on Electron's views at once. */
 maxHosts:200,
};

export type VideoFormatReport={refused:number;played:number;unsupported:number;waited:number;bigVideo:boolean};

const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):0;

/** The page script's counts, or null when the page has none (not installed, or not a CEF page). */
export function readVideoFormatReport(value:unknown):VideoFormatReport|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 return {refused:count(r.refused),played:count(r.played),unsupported:count(r.unsupported),waited:count(r.waited),bigVideo:r.bigVideo===true};
}

/** Whether the page's video needs H.264/AAC: nothing on it played or set up a video stream, and
 * either a video failed because none of its streams could be played, or the page was told a
 * proprietary format is missing at least `settleMs` ago while it shows a video the size of what a
 * person watches (a home page that only probes formats does not count). */
export function needsProprietaryVideo(value:unknown):boolean {
 const report=readVideoFormatReport(value);
 if(!report||report.played>0)return false;
 if(report.unsupported>0)return true;
 return report.refused>0&&report.bigVideo&&report.waited>=VIDEO_FORMATS.settleMs;
}

/** The host a remembered site is kept under: the page's own hostname, lower case. */
export function videoFormatHost(url:string):string {
 try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.hostname.toLowerCase():'';}catch{return '';}
}
