// What kind of computer an event came from, coarse enough that it never names one: the chip family, the memory size
// band, the architecture the app runs as and whether macOS or Windows translates it (an Intel build on Apple silicon).
// Owner decision 2026-10-11: slowness reports need this to be told apart from the rest.

export const CHIPS=['apple_m1','apple_m1_pro','apple_m1_max','apple_m1_ultra','apple_m2','apple_m2_pro','apple_m2_max','apple_m2_ultra',
 'apple_m3','apple_m3_pro','apple_m3_max','apple_m3_ultra','apple_m4','apple_m4_pro','apple_m4_max','apple_m4_ultra',
 'apple_m5','apple_m5_pro','apple_m5_max','apple_m5_ultra','apple_other','intel','amd','snapdragon','other'] as const;
export const MEMORY_BUCKETS=['8gb_or_less','16gb','24_32gb','36_64gb','over_64gb'] as const;
export const CPU_ARCHS=['arm64','x64','other'] as const;

export interface DeviceFacts {cpuModel:string;arch:string;translated:boolean;memoryBytes:number}
export interface DeviceClass {chip:string;memory_bucket:string;cpu_arch:string;rosetta:'yes'|'no'}

/** The chip family from the CPU's model string ("Apple M1 Pro", "Intel(R) Core(TM) i7…"), never the string itself. */
export function chipFamily(model:string):string {
 const apple=/\bApple M(\d+)(?:\s+(Pro|Max|Ultra))?\b/i.exec(model);
 if(apple){
  const chip='apple_m'+apple[1]+(apple[2]?'_'+apple[2].toLowerCase():'');
  return (CHIPS as readonly string[]).includes(chip)?chip:'apple_other';
 }
 if(/\bApple\b/i.test(model))return 'apple_other';
 if(/\bIntel\b/i.test(model))return 'intel';
 if(/\bAMD\b/i.test(model))return 'amd';
 if(/Snapdragon|Qualcomm/i.test(model))return 'snapdragon';
 return 'other';
}
/** Installed memory in bands: macOS reports 8 GB as 8 GiB, so the bands are in GiB rounded. */
export function memoryBucket(bytes:number):string {
 if(!Number.isFinite(bytes)||bytes<=0)return '';
 const gib=Math.round(bytes/2**30);
 return gib<=8?'8gb_or_less':gib<=16?'16gb':gib<=32?'24_32gb':gib<=64?'36_64gb':'over_64gb';
}
export function deviceClass(facts:DeviceFacts):DeviceClass {
 return {chip:chipFamily(facts.cpuModel),memory_bucket:memoryBucket(facts.memoryBytes),
  cpu_arch:(CPU_ARCHS as readonly string[]).includes(facts.arch)?facts.arch:'other',rosetta:facts.translated?'yes':'no'};
}

/** The main process stopped answering for this long (the World, every website page and Fox wait on it). */
export const MAIN_STALL_MS=1000;
/** At most this many `main_stall` events per run, so one bad run cannot flood the project. */
export const MAIN_STALL_LIMIT=30;
/** What was running: a host action's or a named background task's code name (letters and digits only), never data. */
export function stallTask(label:unknown):string {
 return typeof label==='string'&&/^[A-Za-z][A-Za-z0-9]{0,47}$/.test(label)?label:'unlabelled';
}
