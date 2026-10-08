/** Persisted items can retain provider-specific metadata through shared decisions. */
export type WorldItem=Record<string,unknown>;
export interface WorldItemDates {
 /** Host date parser results; null means absent or invalid. Seconds since epoch. */
 start:number|null;
 end:number|null;
}
