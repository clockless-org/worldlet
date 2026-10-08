// My Applets (owner decision 2026-10-06, "最后就两个概念，一个是Applet，一个是Artifact"): the person's World has two
// kinds of thing. An artifact is something Fox shows (core/artifacts); an Applet is a place they go back to. An Applet
// is either built in (the catalog's) or the person's own: a website they made into one, a page Fox made that they keep,
// or a conversation they brought and kept. Their own carry a small mark on their device so they read as theirs
// (core/applets/MY-APPLETS.md).

/** Where one of the person's own Applets came from: a website, a page Fox made (an artifact kept), a conversation. */
export type MyAppletKind='site'|'page'|'conversation';
export const MY_APPLET_KINDS:readonly MyAppletKind[]=Object.freeze(['site','page','conversation']);

/** The words that say what one of the person's own Applets is, for its name tag and panel. */
export const MY_APPLET_LABELS:Readonly<Record<MyAppletKind,string>>=Object.freeze({
 site:'Your Applet · from a website',
 page:'Your Applet · made by Fox',
 conversation:'Your Applet · from a conversation',
});

/** The kind of the person's own Applet, or null for a built-in one. */
export function myAppletKind(app:unknown):MyAppletKind|null {
 const mine=(app as {mine?:unknown}|null)?.mine;
 return typeof mine==='string'&&(MY_APPLET_KINDS as readonly string[]).includes(mine)?mine as MyAppletKind:null;
}
export const isMyApplet=(app:unknown)=>myAppletKind(app)!==null;
