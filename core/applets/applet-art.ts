// Pictures for the person's own Applets (owner request 2026-10-06: "可以用本地ImageGen的模型去生成这个Icon的图片，包括背景图"):
// when one of their own Applets arrives, Worldlet asks the image model they already have on this computer (Codex's
// image generation, through their Codex sign-in or API key) for its icon and its background, in Worldlet's style.
// Nothing is painted without it, and Worldlet pays for no image (core/applets/MY-APPLETS.md#pictures).
import type {MyAppletKind} from './mine.ts';

export const APPLET_ART_LIMITS=Object.freeze({
 /** Data URLs as kept: the icon is a small square PNG, the background a wide JPEG. */
 icon:160_000,background:900_000,iconSize:256,backgroundWidth:1600,
 /** How long one painting may take, and how long after a failure the same Applet is tried again. */
 paintMs:6*60_000,retryMs:24*3600_000,
 /** At most this many Applets are painted per World each day: each picture spends the person's own model tokens. */
 perDay:12,
});

/** What the painter is told about an Applet: its name, what it is for and where it came from. */
export interface AppletArtSubject {applet:string;title:string;about:string;kind:MyAppletKind}
/** One Applet's pictures as kept: data URLs, who painted them and when (seconds since 1970). */
export interface AppletArt {applet:string;icon:string;background:string;painter:'codex';madeAt:number}
/** One Applet's painting attempt that failed, so it is not tried again at once. */
export interface AppletArtAttempt {applet:string;failedAt:number;reason:string}

/** The person's own Applets only: a website, a page, a kept conversation (their World IDs). */
export const validArtApplet=(id:unknown):id is string=>typeof id==='string'&&/^app-(site-[a-z0-9]{6,32}|wgt-[a-z0-9]{10}|job-[a-z0-9]{12})$/.test(id);

const clip=(value:unknown,count:number)=>[...(typeof value==='string'?value.replace(/\s+/g,' ').trim():'')].slice(0,count).join('');
const STYLE='Hand-painted storybook illustration in the style of a cozy miniature village world: soft gouache and watercolor textures, warm afternoon light, gentle shadows, muted sage green, honey yellow, terracotta and cream palette, rounded friendly shapes. No text, no letters, no numbers, no logos, no watermark, no people.';

/** One subject as the painter sees it: what kind of place and what it is for, never page or mail text verbatim. */
export function readArtSubject(value:unknown):AppletArtSubject|null {
 const v=value as Partial<AppletArtSubject>|null;
 if(!v||!validArtApplet(v.applet)||!['site','page','conversation'].includes(v.kind as string))return null;
 const title=clip(v.title,60);if(!title)return null;
 return {applet:v.applet,title,about:clip(v.about,200),kind:v.kind as MyAppletKind};
}

const thing=(subject:AppletArtSubject)=>subject.kind==='site'?`the website “${subject.title}”`:subject.kind==='conversation'?`an ongoing project called “${subject.title}”`:`a small personal app called “${subject.title}”`;

/** The words for each picture. */
export function appletArtPrompt(picture:'icon'|'background',subject:AppletArtSubject):string {
 const about=subject.about?` It is for: ${subject.about}.`:'';
 if(picture==='icon')return `Paint a square app icon for ${thing(subject)}.${about} One single simple object that stands for it, centered, filling most of the square, on a plain warm cream background, readable when shown tiny (48 pixels). ${STYLE}`;
 return `Paint a wide 16:9 background scene for ${thing(subject)}.${about} A calm, uncluttered interior or landscape that feels like this place, with soft detail at the edges and a quiet, open middle where content will sit on top. ${STYLE}`;
}

/** What the Codex task is asked: both pictures, saved under fixed names in its working folder. */
export function codexArtTask(subject:AppletArtSubject):string {
 return `$imagegen Make two images with the image generation tool, then save them in the current folder.\n1. Save as icon.png (square, 1024x1024): ${appletArtPrompt('icon',subject)}\n2. Save as background.png (wide, 1536x1024): ${appletArtPrompt('background',subject)}\nDo nothing else. Do not read, write or delete any other file. When both files are saved, answer with one word: done.`;
}

const DATA_IMAGE=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** A kept record, checked: two data images within their limits. */
export function readAppletArt(value:unknown):AppletArt|null {
 const v=value as Partial<AppletArt>|null;
 if(!v||!validArtApplet(v.applet)||v.painter!=='codex'||typeof v.madeAt!=='number')return null;
 if(typeof v.icon!=='string'||v.icon.length>APPLET_ART_LIMITS.icon||!DATA_IMAGE.test(v.icon))return null;
 if(typeof v.background!=='string'||v.background.length>APPLET_ART_LIMITS.background||!DATA_IMAGE.test(v.background))return null;
 return {applet:v.applet,icon:v.icon,background:v.background,painter:'codex',madeAt:v.madeAt};
}

/** Which of the Applets in the World to paint now: those with no pictures, not tried and failed recently,
 * within the day's allowance. */
export function artToPaint(subjects:AppletArtSubject[],{painted,attempts,paintedToday,now}:{painted:Set<string>;attempts:AppletArtAttempt[];paintedToday:number;now:number}):AppletArtSubject[] {
 const room=Math.max(0,APPLET_ART_LIMITS.perDay-paintedToday);
 const recent=new Set(attempts.filter(a=>now*1000-a.failedAt*1000<APPLET_ART_LIMITS.retryMs).map(a=>a.applet));
 const seen=new Set<string>();
 return subjects.filter(s=>{if(seen.has(s.applet)||painted.has(s.applet)||recent.has(s.applet))return false;seen.add(s.applet);return true;}).slice(0,room);
}
