import type {WorldApp} from './catalog.ts';
// Moment Applets (core/artifacts/README.md): an Applet Fox makes for one moment of the person's day, such as a guide
// for today's museum visit. None is in the catalog; each made one becomes its own Applet in the World until its
// moment is over. Their records are kept in the `widgets` table (an older name for the same thing).

/** The Applet task that makes them. It has no device of its own: what it makes appears in the World. */
export const MOMENT_MAKER={id:'app-moment-maker',key:'moment-maker',title:'Fox'} as const;
/** The painted device every moment Applet stands on, by its art key in the built-in style. */
export const MOMENT_ART='moment';
export const momentAppletId=(id:string)=>'app-'+id;
export const momentRecordId=(appletId:string)=>appletId.startsWith('app-wgt-')?appletId.slice(4):null;

export interface MomentSummary {id:string;title:string;blurb:string;color:string;endsAt:number;pinned:boolean;createdAt:number}

/** One moment Applet as the World places it: on the Home ground, its own name, its own page. */
export function momentApplet(moment:MomentSummary):WorldApp{
 return {
  id:momentAppletId(moment.id),key:moment.id,title:moment.title,region:'home',version:1,
  description:moment.blurb||'Fox made this Applet for today.',
  fullView:{kind:'moment'},scene:{template:'device',color:moment.color,renderer:'painted-device',version:1},
  connection:{kind:'none',provider:null,capability:'local'},content:{activity:'Making'},installByDefault:false,
  art:MOMENT_ART,mine:'page',moment:{id:moment.id,endsAt:moment.endsAt,pinned:moment.pinned,createdAt:moment.createdAt},
  shape:'device',color:moment.color,provider:undefined,capability:'local',
 };
}
