// How much this computer keeps, in bands, once a day (`local_data_size`): the World's database, its browsing
// recordings, how many events the World wrote, and the Agents' own history databases Worldlet reads, plus free disk.
// Owner request 2026-10-11 (「能收集的都尽量收集」): a 3.5 GB World and a 19 GB Hermes history made Settings and the
// browser hang, and nothing reported the sizes. Sizes and counts only, never a name, path or content.

export const SIZE_BUCKETS=['none','under_100mb','100mb_1gb','1_2gb','2_5gb','5_10gb','10_20gb','20_50gb','over_50gb'] as const;
export const ROW_BUCKETS=['under_10k','10k_100k','100k_1m','1m_10m','over_10m'] as const;

/** Bytes in decimal bands (as Finder and Explorer show sizes); null or 0 is `none`. */
export function sizeBucket(bytes:number|null|undefined):string {
 if(bytes==null||!Number.isFinite(bytes)||bytes<=0)return 'none';
 const gb=bytes/1e9;
 return gb<0.1?'under_100mb':gb<1?'100mb_1gb':gb<2?'1_2gb':gb<5?'2_5gb':gb<10?'5_10gb':gb<20?'10_20gb':gb<50?'20_50gb':'over_50gb';
}
export function rowBucket(rows:number):string {
 const n=Number.isFinite(rows)&&rows>0?rows:0;
 return n<10_000?'under_10k':n<100_000?'10k_100k':n<1_000_000?'100k_1m':n<10_000_000?'1m_10m':'over_10m';
}

export interface LocalDataFacts {worldBytes:number;recordingBytes:number;eventRows:number;hermesBytes:number|null;openclawBytes:number|null;diskFreeBytes:number|null}
/** The event's dimensions; an Agent that is not on this computer is `none`. */
export function localDataDimensions(facts:LocalDataFacts):Record<string,string> {
 return {world_db_size:sizeBucket(facts.worldBytes),recordings_size:sizeBucket(facts.recordingBytes),history_rows:rowBucket(facts.eventRows),
  hermes_db_size:sizeBucket(facts.hermesBytes),openclaw_db_size:sizeBucket(facts.openclawBytes),disk_free:sizeBucket(facts.diskFreeBytes)};
}
