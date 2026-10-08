// Video formats (#1174, core/browser/video-formats.ts): when a CEF page counts as needing H.264/AAC
// and moves to Electron's views, and what the page script (platform/bridge/video-formats.js) counts.
import assert from 'node:assert/strict';
import {PROPRIETARY_VIDEO,VIDEO_FORMATS,needsProprietaryVideo,readVideoFormatReport,videoFormatHost} from '../core/browser/index.ts';
import {installVideoFormatWatch} from '../platform/bridge/video-formats.js';

const settled=VIDEO_FORMATS.settleMs;
// Twitch: told H.264 is missing, a big player, nothing played.
assert.equal(needsProprietaryVideo({refused:2,played:0,unsupported:0,waited:settled,bigVideo:true}),true);
// YouTube: told H.264 is missing, then set up VP9 and played.
assert.equal(needsProprietaryVideo({refused:3,played:1,unsupported:0,waited:60000,bigVideo:true}),false);
// Not yet settled: the page may still fall back.
assert.equal(needsProprietaryVideo({refused:1,played:0,unsupported:0,waited:settled-1,bigVideo:true}),false);
// A home page that only probes formats, with no video a person watches.
assert.equal(needsProprietaryVideo({refused:4,played:0,unsupported:0,waited:60000,bigVideo:false}),false);
// A video that failed for want of a playable stream counts at once, unless something else played.
assert.equal(needsProprietaryVideo({refused:0,played:0,unsupported:1,waited:0,bigVideo:false}),true);
assert.equal(needsProprietaryVideo({refused:0,played:2,unsupported:1,waited:0,bigVideo:false}),false);
// No counts (an Electron page, a page without the script, anything the page made up).
for(const value of [null,undefined,'x',[],{},{refused:'9',bigVideo:'true',waited:1e9}])assert.equal(needsProprietaryVideo(value),false,JSON.stringify(value));
assert.deepEqual(readVideoFormatReport({refused:-1,played:NaN,unsupported:1.7,waited:Infinity,bigVideo:1}),{refused:0,played:0,unsupported:1,waited:0,bigVideo:false});
// Formats that need proprietary codecs, and ones the standard build plays.
for(const type of ['video/mp4; codecs="avc1.42E01E, mp4a.40.2"','video/mp4;codecs=avc3.64001f','video/mp4; codecs="hvc1.1.6.L93.B0"','audio/mp4; codecs="mp4a.40.2"','application/vnd.apple.mpegurl','application/x-mpegURL','audio/mp4; codecs="ec-3"'])assert.ok(PROPRIETARY_VIDEO.test(type),type);
for(const type of ['video/webm; codecs="vp9"','video/mp4; codecs="av01.0.05M.08"','audio/webm; codecs="opus"','video/mp4','audio/mp4; codecs="opus"'])assert.ok(!PROPRIETARY_VIDEO.test(type),type);
// Sites are kept by hostname, https only.
assert.equal(videoFormatHost('https://www.Twitch.tv/somebody?x=1'),'www.twitch.tv');
for(const url of ['http://twitch.tv/','about:blank','nope'])assert.equal(videoFormatHost(url),'');

// The page script, in a page that has none of H.264/AAC, VP9 and AV1 being playable.
const g=globalThis as any;
const playable=(type:string)=>!PROPRIETARY_VIDEO.test(type);
class Media {canPlayType(type:string){return playable(type)?'maybe':'';}}
class Video extends Media {width=640;height=360;getBoundingClientRect(){return {width:this.width,height:this.height};}}
class Source {addSourceBuffer(type:string){if(!playable(type))throw new DOMException('unsupported','NotSupportedError');return {};}static isTypeSupported(type:string){return playable(type);}}
const listeners:Record<string,((event:any)=>void)[]>={},videos:Video[]=[];
let now=0;
Object.assign(g,{MediaSource:Source,HTMLMediaElement:Media,HTMLVideoElement:Video,innerWidth:1280,innerHeight:720,
 addEventListener:(name:string,listener:(event:any)=>void)=>{(listeners[name]??=[]).push(listener);},
 document:{querySelectorAll:()=>videos}});
Object.defineProperty(g,'performance',{value:{now:()=>now},configurable:true});
const fire=(name:string,target:unknown)=>{for(const listener of listeners[name]??[])listener({target});};
const original=Source.isTypeSupported;
installVideoFormatWatch(PROPRIETARY_VIDEO.source);
installVideoFormatWatch(PROPRIETARY_VIDEO.source);
const read=()=>g.__worldletVideoFormats();
// Answers stay the engine's own, under the same name.
assert.equal(Source.isTypeSupported('video/mp4; codecs="avc1.42E01E"'),false);
assert.equal(Source.isTypeSupported('video/webm; codecs="vp9"'),true);
assert.equal(Source.isTypeSupported.name,original.name);
assert.equal(new Media().canPlayType('application/vnd.apple.mpegurl'),'');
assert.equal(listeners.playing.length,1,'installed once');
now=1000;
assert.deepEqual(read(),{refused:2,played:0,unsupported:0,waited:1000,bigVideo:false},'waited counts from the first refusal');
assert.equal(needsProprietaryVideo(read()),false,'no player yet');
// A big player shows and nothing plays: after settleMs it needs H.264/AAC.
videos.push(new Video());now=settled;
assert.deepEqual(read(),{refused:2,played:0,unsupported:0,waited:settled,bigVideo:true});
assert.equal(needsProprietaryVideo(read()),true);
// Setting up a VP9 stream means the page found a format: it stays.
assert.throws(()=>new Source().addSourceBuffer('video/mp4; codecs="avc1.4d401f"'),/unsupported/);
new Source().addSourceBuffer('video/webm; codecs="vp9"');
assert.equal(read().played,1);assert.equal(needsProprietaryVideo(read()),false);
// A video that failed for want of a playable stream, and one that only failed to load.
const failed=Object.assign(new Video(),{error:{code:4,message:'DEMUXER_ERROR_NO_SUPPORTED_STREAMS: FFmpegDemuxer: no supported streams'}});
const missing=Object.assign(new Video(),{error:{code:4,message:'MEDIA_ELEMENT_ERROR: Format error'}});
fire('error',failed);fire('error',missing);fire('playing',new Video());
assert.equal(read().unsupported,1);assert.equal(read().played,2);
// A sound that failed for want of a playable stream (a game's music) does not count: only video moves a page.
fire('error',Object.assign(new Media(),{error:{code:4,message:'DEMUXER_ERROR_NO_SUPPORTED_STREAMS: FFmpegDemuxer: no supported streams'}}));
assert.equal(read().unsupported,1,'a failed sound is not a video that needs H.264/AAC');
console.log('PASS video formats: pages that need H.264/AAC move to Electron\'s views; YouTube-style fallbacks, probes, failed sounds and plain load failures do not');
