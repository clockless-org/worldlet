export interface Onboarding {
 version:number;presets:string[];completed:boolean;
 unlockedApplets?:string[];hiddenApplets?:string[];appletPositions?:Record<string,number[]>;
 introStep?:number;journeyStage?:string;journeyItemId?:string;mailStarted?:boolean;gamesOffered?:boolean;offeredGames?:string[];
 /** The World's area presentation (ui/world/region-layout.ts RegionLayout): names, membership, pinned places and last use. */
 regionLayout?:Record<string,unknown>;
 establishedRegions?:string[];connectionRegions?:Record<string,string>;regionSources?:Record<string,string[]>;
}
