/** What the host hands the World renderer (ui/world/village/village-world.ts) and what the renderer hands back. This is
 * the host's own interface, not part of the Theme contract: a theme is static pictures, sounds and JSON
 * (resources/themes/CONTRACT.md), and the World is drawn by the host. */
export type WorldRecord = Readonly<Record<string,unknown>>;
export interface WorldApplet {id:string;key:string;title:string;region:string;visible:boolean;status?:string;count?:number;
 /** This Applet's picture: the icon a person's own Applet carries, else the theme's `icons` entry, else the host's device art. Show it rather than a placeholder. */
 icon?:string;
 /** The Applet's lamp as the host shows it. The World lights the lamps in its art; the host draws the lamp's label and action. */
 lamp?:WorldLampState;
 connected?:boolean;
 /** Set for the person's own Applets (core/applets/MY-APPLETS.md): which kind it is. */
 mine?:string;
 /** A thing that is not an Applet (a trip, a parcel). It is shown only while it is open. */
 object?:boolean;
 /** The catalog Applet whose picture this one shares, when it is not its own `key`. */
 art?:string;
 /** When the person last used it or it arrived (ms since 1970). The World puts recent ones first. */
 usedAt?:number;
 /** While it is open, the host's Applet stage draws this Applet's own picture in front. The World stops drawing its device behind it. */
 staged?:boolean;
 /** Coding Applets: the weekly allowance left. `remaining` is a percentage; neither is set while it is unknown. */
 allowance?:{remaining?:number;resetsAt?:number;unavailable?:boolean}}
export type WorldLampState='off'|'ready'|'processing'|'error';
export interface WorldState {
 view:{id:string;level:'overview'|'area'|'applet'};
 applets:readonly WorldApplet[];
 areas:readonly {id:string;title:string;
  /** The look the person chose for the area, when the World offers several. */
  look?:string}[];
 interaction:{placementArea:string|null;framedArea:string|null;inset:number;hoveredApplet:string|null;hoveredArea:string|null;
  /** First use: areas and Applets can't be opened or moved yet. */
  locked?:boolean;
  /** Something sits over the World (the tour, a dialog, an attention preview): no hover, no lamp actions. */
  covered?:boolean;
  /** The open Applet shows an item's detail beside it. */
  detailOpen?:boolean;
  /** The open Applet shows its website instead of its own contents. */
  website?:boolean};
 pins:Readonly<Record<string,readonly (string|null)[]>>;
 environment:WorldRecord;
 motion:boolean;
 /** Nobody can see the World right now (Fox floats on the desktop, or the window is hidden). Stop drawing. */
 paused?:boolean;
 /** Applets that arrive next, before `applet.arrived` shows them: the World puts them where they will land. */
 arriving?:readonly string[];
}
/** A place the World marks for the host's shared overlays: the accessible button, the name, the lamp label and the
 * attention mark the host draws there. CSS pixels relative to the World's host element. */
export interface WorldMark {
 kind:'applet'|'area'|'area-add'|'slot';id:string;x:number;y:number;visible:boolean;
 /** Slot marks: the place's index in its area, as moveApplet takes it. */
 slot?:number;
 /** Applet marks: show the name beside the Applet. */
 label?:boolean;
 hovered?:boolean;
 /** Applet marks: where the lamp sits and where the attention mark hangs, relative to x and y. */
 lamp?:{x:number;y:number};
 attention?:{x:number;y:number};
}
export interface WorldContext {
 host:HTMLElement;state:WorldState;
 navigate(target:{kind:'applet'|'area';id:string}):void;
 menu(id:string,x:number,y:number):void;
 moveApplet(id:string,area:string,slot?:number):void;
 /** Published URL of a theme-package `assets/...` path. */
 asset(path:string):string;
 /** Report where the host draws its shared overlays. The World draws no buttons, names or lamp labels of its own. */
 marks?(marks:Readonly<Record<string,WorldMark>>):void;
 /** Leave the open area or Applet, as the host's Back does. */
 back?():void;
 /** Open an area's own panel (its Applets and places), as its area mark does. */
 openArea?(id:string):void;
}
export interface WorldEvent {
 type:'mail.received'|'applet.arrived';ids:readonly string[];
 /** Arrivals: they fly in from the middle of the window, each starting as its icon. */
 from?:'center';
 icons?:Readonly<Record<string,string>>;
 /** Arrivals: they are already in place; only settle them (their shadows), don't fly them in. */
 settled?:boolean;
}
export interface WorldMount {
 dispose():void;
 update(state:WorldState):void;
 /** Whether the World played it. An arrival may return a promise that settles when the Applets have landed. */
 event(event:WorldEvent):boolean|Promise<boolean>;
 /** CSS pixels relative to host. Used by the companion and host accessibility surfaces. */
 anchor(id:string):{x:number;y:number}|null;
 bounds(id:string):{x:number;y:number;width:number;height:number}|null;
 /** The World stays drawn behind an open Applet (blurred, its device in front). Otherwise the host hides it. */
 behindApplet?:boolean;
 /** What is on screen now, for the zoom between the World and an Applet. */
 picture?():HTMLCanvasElement|null;
 /** Renderer facts for the product's own checks. */
 metrics?():WorldRecord;
 /** Settles once the World's first frame is drawn; until then the host keeps its loading page. A rejection is the host's
  * "could not open" state. Without it the World counts as ready as soon as it is mounted. */
 ready?:Promise<void>;
}
