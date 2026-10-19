// Focus on website pages (owner request 2026-10-05): a website Applet shows the page's main content, not what
// distracts from it. Article pages (news, blogs, docs) show only the article, extracted with Firefox's Reader View
// algorithm (Readability) over the page; app-style sites keep their page with the distracting parts hidden by each
// site's rules (recommendation columns, trends, Shorts shelves), and every site loses its ads and cookie walls.
// Focus is on by default; the Focus switch in the Applet's top bar turns it off for that site, and the choice is kept
// in the World (`site-focus` records in world.sqlite). No model is involved: the rules below and Readability decide.
// The host applies the plan with platform/bridge/page-focus.ts in the page's isolated world.

/** Hidden on every site: ad slots and cookie/consent walls that cover the page. */
export const FOCUS_EVERYWHERE=[
 'ins.adsbygoogle','[id^="google_ads_iframe"]','[id^="div-gpt-ad"]','iframe[src*="doubleclick.net"]','iframe[src*="googlesyndication.com"]',
 '#onetrust-consent-sdk','#CybotCookiebotDialog','.fc-consent-root','.qc-cmp2-container','#didomi-host','.truste_overlay','.truste_box_overlay',
] as const;

/** App-style sites: what each one shows beside its main content. A host matches its own rules and its subdomains'. */
export const FOCUS_SITES:Readonly<Record<string,readonly string[]>>={
 'youtube.com':['#secondary #related','ytd-watch-next-secondary-results-renderer','ytd-reel-shelf-renderer','ytd-rich-shelf-renderer[is-shorts]','ytd-ad-slot-renderer','#masthead-ad','ytd-merch-shelf-renderer','#player-ads'],
 'x.com':['[data-testid="sidebarColumn"]'],
 'twitter.com':['[data-testid="sidebarColumn"]'],
 'reddit.com':['#right-sidebar-container','shreddit-ad-post','[data-testid="frontpage-sidebar"]'],
 'zhihu.com':['.Question-sideColumn','.GlobalSideBar','.Pc-feedAd-container','.Pc-word','.AdblockBanner'],
 'bilibili.com':['.right-container .recommend-list-v1','.ad-report','.video-card-ad-small','.slide-ad-exp','.activity-m-v1'],
 'linkedin.com':['aside.scaffold-layout__aside','.ad-banner-container'],
 'stackoverflow.com':['#hot-network-questions','.s-sidebarwidget--yellow','#sidebar .js-sidebar-zone'],
};

/** Sites people work in, or whose page is the app itself: never turned into an article. */
const NOT_ARTICLES=['google.com','notion.so','github.com','figma.com','discord.com','slack.com','linear.app','chatgpt.com','claude.ai','zoom.us',
 'teams.microsoft.com','office.com','live.com','tiktok.com','instagram.com','facebook.com','xiaohongshu.com','douyin.com','weibo.com','netflix.com','twitch.tv',
 'pokemonshowdown.com','excalidraw.com','tldraw.com','vercel.com','stripe.com','doordash.com','amazon.com','taobao.com','jd.com'];

/** The Clean up action beside Fox on a website page (owner request 2026-10-05): Fox reads the page's outline and saves
 * which parts of the site Focus hides, through browse_web outline and focus. */
export const FOCUS_RULES_REQUEST='Clean up the website open now: read its outline with browse_web outline, then save the distracting parts '
 +'(sidebars, recommendations, trends, banners, popups) with browse_web focus and hide, keeping the main content I came for and the rules the site already has. '
 +'Then tell me in one sentence what you hid.';

export const PAGE_FOCUS_LIMITS={selectors:30,selector:200,records:400,articleChars:900} as const;

export interface SiteFocusRecord {id:string;host:string;off:boolean;hide:string[];updatedAt:number}
export interface PageFocusPlan {on:boolean;host:string;hide:string[];reader:boolean;articleChars:number}

/** The site a page belongs to, as focus keeps it: its host without `www.`; null for anything but a public web page. */
export function focusHost(raw:unknown):string|null {
 let url:URL;try{url=new URL(String(raw));}catch{return null;}
 if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
 const host=url.hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
 if(!host.includes('.')||host==='localhost'||/^[\d.]+$/.test(host)||host.includes(':'))return null;
 return host;
}
const under=(host:string,site:string)=>host===site||host.endsWith('.'+site);
/** The record's ID in the `site-focus` bucket: one per site. */
export const siteFocusId=(host:string)=>'focus-'+host.replace(/[^a-z0-9.-]/g,'').slice(0,200);

/** A rule saved for a site is one CSS selector that hides parts of it; anything that could escape the rule, or hide the
 * whole page, is refused. */
export function focusSelector(raw:unknown):string|null {
 if(typeof raw!=='string')return null;
 const value=raw.replace(/\s+/g,' ').trim();
 if(!value||value.length>PAGE_FOCUS_LIMITS.selector||/[{}<>;@\\]|\/\*/.test(value))return null;
 if(value.split(',').some(part=>/^(?:html|body|head|main|:root|\*)$/i.test(part.trim())))return null;
 return value;
}
const selectors=(values:unknown):string[]=>[...new Set((Array.isArray(values)?values:[]).map(focusSelector).filter((s):s is string=>!!s))].slice(0,PAGE_FOCUS_LIMITS.selectors);

export function readSiteFocus(row:unknown):SiteFocusRecord|null {
 const r=row as any;const host=focusHost('https://'+String(r?.host??''));
 if(!r||!host||r.id!==siteFocusId(host)||typeof r.updatedAt!=='number')return null;
 return {id:r.id,host,off:r.off===true,hide:selectors(r.hide),updatedAt:r.updatedAt};
}

/** The site's record after the person turns Focus on or off there, or new rules are saved for it. */
export function siteFocusRecord(previous:SiteFocusRecord|null,host:string,change:{off?:boolean;hide?:unknown},now:number):SiteFocusRecord {
 return {id:siteFocusId(host),host,off:change.off??previous?.off??false,hide:change.hide!==undefined?selectors(change.hide):previous?.hide??[],updatedAt:now};
}

export function siteFocusFor(records:readonly SiteFocusRecord[],raw:unknown):SiteFocusRecord|null {
 const host=focusHost(raw);return host?records.find(r=>r.host===host)??null:null;
}

/** What Focus does on this page: on unless the person turned it off for the site; the parts to hide; whether the page
 * may become its article (never on app-style sites or sites people work in). Null where Focus does not apply. */
export function pageFocusPlan(raw:unknown,record:SiteFocusRecord|null=null):PageFocusPlan|null {
 const host=focusHost(raw);if(!host)return null;
 const sites=Object.keys(FOCUS_SITES).filter(site=>under(host,site));
 const on=!(record&&record.host===host&&record.off);
 const own=record&&record.host===host?record.hide:[];
 return {on,host,hide:[...new Set([...FOCUS_EVERYWHERE,...sites.flatMap(site=>FOCUS_SITES[site]),...own])],
  reader:!sites.length&&!own.length&&!NOT_ARTICLES.some(site=>under(host,site)),articleChars:PAGE_FOCUS_LIMITS.articleChars};
}
