import type {ServicePreset} from './service-presets.ts';
import type {ServiceRecords} from './services.ts';
/** Owner-enabled collection of a saved Service read; no credential or Agent grant is held here. */
export interface ServiceSyncJob {
 id:string;provider:string;preset:ServicePreset;binding:string;revision:number;
 check:Record<string,any>;
}
/** Page cursor, not a provider change-feed token. Published data stays intact until this traversal finishes. */
export interface ServiceSyncCheckpoint {cursor?:string;seen:string[];pages:number;records:ServiceRecords['records'];startedAt:number}
export interface ServiceSyncSnapshot extends ServiceRecords {id:string;collectedAt:number;startedAt:number;pages:number;coverage:'bounded-reader'}

export const SERVICE_SYNC_BUCKETS=['service-sync-jobs','service-sync-pages','service-sync-snapshots'] as const;
