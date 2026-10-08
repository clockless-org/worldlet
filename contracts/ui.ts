/** Semantic World interface. No native objects, coordinates, or provider types. */
export interface UIContext {id:string;title:string;depth:string}
export interface UITarget {id:string;label:string;kind:'region'|'applet'}
export interface UISnapshot {version:1;context:UIContext;targets:UITarget[]}
export type UICommand = {version:1;action:'activate';id:string}|{version:1;action:'back'|'overview'};
export interface WorldUI {
 version:1;
 snapshot():UISnapshot;
 dispatch(command:UICommand):Promise<unknown>;
}
