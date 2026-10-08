import type {AttentionRegistration} from './attention.ts';
import type {HostFeatures} from './platform.ts';
// The shapes the world is made of.
//
// These are the objects that travel between the compiler, the scene, the HUD and
// Fox's tools. Each names the fields the code actually reads, and keeps an index
// signature for the ones it does not: the world is assembled from data at runtime
// and carries per-Applet extras, so a closed type here would be a lie that costs a
// cast at every use. Narrow a field as its meaning settles; do not narrow the index
// signature away until the last dynamic reader is gone.

/** A note, an item or an original: anything the reader can open. */
export interface WorldPage {
 id: string;
 title: string;
 kind?: string;
 parent?: string | null;
 children?: string[];
 path?: string;
 paths?: string[];
 markdown?: string;
 text?: string;
 /** The Applet a record came from, and the item it was published as. */
 sourceId?: string;
 sourceProvider?: string;
 sourceURL?: string;
 worldItemId?: string;
 worldItemKind?: WorldItemKind;
 worldItemStatus?: WorldItemStatus;
 /** The sample world names both, so a note can be placed without guessing. */
 matter?: string;
 applet?: string;
 objectKind?: string;
 spatialStatus?: string;
 provenance?: {provider: string; label: string}[];
 activities?: WorldSignal[];
 events?: WorldSignal[];
 [key: string]: any;
}

export type WorldItemKind = 'task' | 'event' | 'update';
export type WorldItemStatus = 'candidate' | 'open' | 'read' | 'done' | 'dismissed';

/** One saved finding, with evidence, in the contract every Applet publishes through. */
export interface WorldItem {
 id: string;
 provider: string;
 kind: WorldItemKind;
 status: WorldItemStatus;
 title: string;
 context?: string;
 summary?: string;
 priority?: 'normal' | 'elevated' | 'important' | 'high' | 'urgent';
 start?: string;
 end?: string;
 allDay?: boolean;
 sources?: {provider?: string; id?: string; url?: string; quote?: string; local?: boolean}[];
 createdAt?: number | string;
 updatedAt?: number | string;
 [key: string]: any;
}

/** What a page contributes to the Attention Center and to a stage. */
export interface WorldSignal {
 kind?: string;
 title?: string;
 quote?: string;
 summary?: string;
 priority?: string;
 start?: string;
 end?: string;
 allDay?: boolean;
 [key: string]: any;
}

/** An Applet or a Matter: the things that stand in a region. */
export interface WorldSection {
 id: string;
 moduleId?: string;
 title: string;
 entity?: 'app' | 'matter';
 region?: string;
 theme?: string;
 children: string[];
 buildingId?: string | null;
 areaId?: string;
 summary?: string;
 objectKind?: string;
 status?: {state: string; label: string; count?: number | null; [key: string]: any};
 [key: string]: any;
}

export interface WorldBuilding {
 id: string;
 title: string;
 theme?: string;
 region?: string;
 position?: number[];
 color?: string;
 rooms?: string[];
 unbuilt?: boolean;
 [key: string]: any;
}

export interface WorldArea {
 id: string;
 title: string;
 places?: string[];
 buildings?: string[];
 [key: string]: any;
}

/** Everything one world is, as the renderer and the HUD receive it. */
export interface World {
  appName?: string;
  unlockedApplets?: string[];
  /** The areas' saved presentation (onboarding.regionLayout; ui/world/region-layout.ts). */
  regionLayout?: Record<string, unknown>;
  /** The person's own Applets (core/applets/MY-APPLETS.md: ongoingApplet, momentApplet, siteApplet), placed beside the catalog's. */
  dynamicApplets?: any[];
  hiddenApplets?: string[];
  /** Pending task reviews, shown on the Attention card of a task they may update (ui/attention/task-review.ts). */
  taskReviews?: {id: string; provider: string; items: string[]}[];
  appletPositions?: Record<string,number[]>;
 version?: number;
 sample?: boolean;
 workspace?: string;
 roots: string[];
 pages: WorldPage[];
 spaces: WorldSection[];
 buildings?: WorldBuilding[];
 areas?: WorldArea[];
 matters?: WorldSection[];
 apps?: WorldSection[];
 viewObjects?: {id: string; title: string; roomId: string; kind: string; pageIds: string[]; [key: string]: any}[];
 navigationAliases?: Record<string, string>;
 moduleConnections?: ConnectionFacts[];
 coverage?: {pages?: number; scope?: string; [key: string]: any};
 persona?: Record<string, any>;
 [key: string]: any;
}

/** What the Mac publishes about one account, as `core/applets/status.ts` reads it. */
export interface ConnectionFacts {
 provider: string;
 status?: string;
 connected?: boolean;
 running?: boolean;
 failed?: boolean;
 needsAttention?: boolean;
 syncStatus?: string;
 savedItemCount?: number;
 records?: {id: string; title: string}[];
 resultCount?: number;
 summary?: string;
 sample?: boolean;
 [key: string]: any;
}

/** Normalized coordinates in the original sprite, independent of world placement. */
export interface PaintedAppletMotion {
 version: 1;
 kind: 'painted-rig';
 idle: number;
 hover: number;
 speed: number;
 joints: {x:number;y:number;radius:number;dx:number;dy:number;phase:number}[];
 rollers?: {x:number;y:number;radius:number}[];
}

export interface FrameAppletMotion {
 version: 2;
 kind: 'sprite-frames';
 columns: number;
 rows: number;
 frames: number;
 fps: number;
 ambient: boolean;
}
export type AppletMotion = PaintedAppletMotion | FrameAppletMotion;

/** An Applet definition as `ui/applets/<key>/app.ts` declares it. */
export interface AppletDefinition {
 attention?:AttentionRegistration;
 motion?: AppletMotion;
 id: string;
 key: string;
 title: string;
 region: string;
 description: string;
 /** One line on what Fox or the world does with this app, shown on setup tiles. A website Applet never claims account sync. */
 purpose?: string;
 version?: number;
 scene: {template: string; color: string; renderer?: string; version?: number};
 connection: {kind: string; provider?: string; capability?: string; [key: string]: any};
 fullView?: {kind: string; url?: string; platform?: string; original?: {url: string; platform?: string}};
 content?: {noun?: [string, string]; hideTitle?: boolean; statusText?: string; empty?: string; activity?: string};
 placement?: {kind?: string; position: number[]; [key: string]: any};
 availability?: {world?: boolean};
 support?: {level?: string; acceptance?: boolean};
 /** System service the host must offer; absent means no host restriction. */
 requiresHostFeature?: keyof HostFeatures;
 /** The person's own Applet, by where it came from (core/applets/MY-APPLETS.md); absent for a built-in one. */
 mine?: 'site' | 'page' | 'conversation';
 [key: string]: any;
}
