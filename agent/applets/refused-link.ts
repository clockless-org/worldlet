// A link the person followed in a website panel that the panel's rules keep out (owner report 2026-10-06: "点了不跳转"):
// only public https pages open there, and a page may stack at most MAX_POPUPS windows over itself. The panel says so
// instead of doing nothing, naming where the link led (its host, or its scheme for app links such as mailto:).

export interface RefusedLink {kind:string;reason:string;scheme:string;host:string}

export function linkRefusedMessage(refused:RefusedLink):string {
 if(refused.reason==='popups')return 'This page already has several windows open over it. Press Back to close one, then try the link again.';
 const scheme=refused.scheme.toLowerCase();
 if(refused.host&&['http','https'].includes(scheme))return `This link leads to ${refused.host}, which can’t open inside Worldlet.`;
 return scheme?`This link opens another app (${scheme}:), which Worldlet’s browser doesn’t open.`:'This link can’t open inside Worldlet.';
}
