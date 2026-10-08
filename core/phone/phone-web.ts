// Which Applets work on the phone (owner request 2026-10-07: "手机端只放能打开用的 applet，点开它这个网站能真的用"):
// the phone opens an Applet's website in its own browser (or the site's app, when the phone has it), so an Applet goes
// to the phone only when it has a website that is really usable at phone size. The person's own website Applets always
// go; Applets that live only on the computer (Notes, Messages, Codex, the built-in games) and websites that refuse
// phones or only push their app stay on the computer. Judged from each site's known phone behaviour, not tested on a
// device; change this list when a site changes.

/** Built-in Applets whose website does not work in a phone's browser: it sends phones to its app store page, is a
 * desktop editor, needs a keyboard and mouse, or is only a sign-up page. */
export const PHONE_DESKTOP_ONLY:ReadonlySet<string>=new Set([
 'whatsapp','slack','teams','zoom','discord','netflix',
 'microsoft-word','microsoft-excel','microsoft-powerpoint','google-docs','google-sheets','google-slides',
 'figma','capcut','acrobat','baidu-netdisk','feishu','douyin','xiaohongshu','taobao','alipay',
 'krunker-io','agar-io','browser',
]);

/** Built-in Applets whose phone address differs from the computer's (or that have none on the computer). */
const PHONE_ADDRESS:Readonly<Record<string,string>>={
 'google-calendar':'https://calendar.google.com/',
 'github':'https://github.com/',
 'notion':'https://www.notion.so/',
};

/** An https address without credentials, as the phone may open it; '' for anything else. */
export function httpsAddress(value:unknown):string{
 if(typeof value!=='string'||value.length>400)return '';
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
const https=(value:unknown)=>httpsAddress(value)||undefined;

/** The address the phone opens for this Applet, or undefined when it does not work on a phone. `app` is a World row
 * or catalog definition: its `key`, `mine` and `fullView` (`web` with `url`, or a scene with the `original` website). */
export function phoneWebAddress(app:{key?:unknown,mine?:unknown,fullView?:{kind?:string,url?:string,original?:{url?:string}}}|null|undefined):string|undefined{
 if(!app||typeof app.key!=='string')return undefined;
 const view=app.fullView;
 if(app.mine==='site')return https(view?.url);
 if(app.mine||PHONE_DESKTOP_ONLY.has(app.key))return undefined;
 return https(PHONE_ADDRESS[app.key])??(view?.kind==='web'?https(view.url):https(view?.original?.url));
}
