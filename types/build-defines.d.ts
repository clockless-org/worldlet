// Values esbuild substitutes at build time (scripts/build-info.ts). The source
// reads them behind typeof guards; here they are named so the check knows them.
declare const __WORLDLET_CHANNEL__: string;
declare const __WORLDLET_REVISION__: string;
/** ISO 8601 commit time of __WORLDLET_REVISION__. */
declare const __WORLDLET_REVISION_TIME__: string;
declare const __WORLDLET_BUILD__: {version: string; build: string; [key: string]: any};

declare const __WORLDLET_WORKSPACE__: string;
