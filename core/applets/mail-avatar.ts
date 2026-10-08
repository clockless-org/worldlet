/** Mail sender portraits: which public sources may picture a sender, in order. Pure; the host
 * performs every read and keeps results in memory only. A person's own Gravatar comes first,
 * then the sending organization's verified BIMI logo, then its website icon. Personal mail
 * domains never get a website icon (gmail.com's logo is not the sender). Without any of them
 * the Applet shows the sender's initials. */
export const PERSONAL_MAIL_DOMAINS=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','ymail.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.de','gmx.net','mail.com','yandex.ru','yandex.com','mail.ru','zoho.com','fastmail.com','hey.com','tutanota.com','qq.com','foxmail.com','163.com','126.com','yeah.net','sina.com','sina.cn','sohu.com','139.com','aliyun.com','naver.com','daum.net','hanmail.net']);
// Second-level labels that sit under a country code (example.co.uk, example.com.cn).
const PUBLIC_SECOND_LEVEL=new Set(['co','com','net','org','gov','edu','ac','or','ne','go']);
// Fixture and reserved names (RFC 2606/6761) are never looked up.
const RESERVED=/(?:^|\.)(?:example(?:\.(?:com|net|org))?|test|invalid|localhost|local|internal)$/;

export interface MailAvatarPlan {address:string;domain:string;gravatar:boolean;bimi:string[];icon:string}

/** The lowercase address in `Name <a@b.c>` or `a@b.c`; empty when there is none. */
export function mailSenderAddress(from:string):string {
 const value=String(from??'').trim(),angle=value.match(/<([^<>\s]+@[^<>\s]+)>\s*$/);
 const address=(angle?angle[1]:value).trim().toLowerCase();
 return /^[^\s@<>()"',;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/.test(address)&&address.length<=254?address:'';
}

/** The organization's own domain: mail.github.com → github.com, news.bbc.co.uk → bbc.co.uk. */
export function mailOrganizationDomain(domain:string):string {
 const labels=domain.toLowerCase().split('.').filter(Boolean);
 if(labels.length<=2)return labels.join('.');
 const keep=labels.at(-1)!.length===2&&PUBLIC_SECOND_LEVEL.has(labels.at(-2)!)?3:2;
 return labels.slice(-keep).join('.');
}

export function mailAvatarPlan(from:string):MailAvatarPlan|null {
 const address=mailSenderAddress(from);
 if(!address)return null;
 const domain=address.slice(address.lastIndexOf('@')+1);
 if(RESERVED.test(domain))return null;
 const organization=mailOrganizationDomain(domain),personal=PERSONAL_MAIL_DOMAINS.has(organization)||PERSONAL_MAIL_DOMAINS.has(domain);
 return {address,domain,gravatar:true,bimi:personal?[]:[...new Set([domain,organization])],icon:personal?'':organization};
}

/** Gravatar's documented SHA-256 address hash form; `d=404` keeps its default artwork out. */
export function gravatarURL(sha256:string):string {
 if(!/^[0-9a-f]{64}$/.test(sha256))throw new Error('Invalid Gravatar hash.');
 return `https://gravatar.com/avatar/${sha256}?s=160&d=404`;
}

/** A website icon at least as large as the portrait; the service answers 404 for none. */
export function mailIconURL(domain:string):string {
 if(!/^[a-z0-9.-]{3,253}$/.test(domain))throw new Error('Invalid icon domain.');
 return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// Names that only reach this computer or its own network.
const LOCAL_NAME=/(?:^|\.)(?:localhost|local|internal|lan|intranet|home\.arpa|in-addr\.arpa|ip6\.arpa)$/;
/** Whether a host a sender names (a BIMI logo, or where it redirects) may be read: a public DNS
 * name with a dot, never an IP literal (any form, including `0x7f.1` and `2130706433`), localhost
 * or a local-network suffix. The sender, not the person, chose it. */
export function mailRemoteHostAllowed(hostname:string):boolean {
 const host=String(hostname??'').toLowerCase().replace(/\.$/,'');
 if(!host||host.length>253||!host.includes('.')||host.includes(':')||host.startsWith('['))return false;
 if(!/^[a-z0-9.-]+$/.test(host)||LOCAL_NAME.test(host))return false;
 // A final label of digits (or hex) is an IPv4 literal in WHATWG and inet_aton parsing.
 const last=host.split('.').at(-1)!;
 return !/^(?:\d+|0x[0-9a-f]*)$/.test(last);
}
/** A sender-chosen logo URL (BIMI `l=`, or a redirect from it): HTTPS on the default port to an
 * allowed host and an SVG path; empty otherwise. */
export function mailLogoURL(value:string):string {
 try{const url=new URL(value);return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&mailRemoteHostAllowed(url.hostname)&&/\.svg$/i.test(url.pathname)?url.href:'';}catch{return '';}
}
/** The `l=` logo of a `v=BIMI1` DNS record, when it is a `mailLogoURL`. */
export function bimiLogoURL(record:string):string {
 const fields=String(record??'').split(';').map(part=>part.trim()),tags=new Map<string,string>();
 for(const field of fields){const index=field.indexOf('=');if(index>0)tags.set(field.slice(0,index).trim().toLowerCase(),field.slice(index+1).trim());}
 if(tags.get('v')?.toUpperCase()!=='BIMI1')return '';
 return mailLogoURL(tags.get('l')??'');
}
