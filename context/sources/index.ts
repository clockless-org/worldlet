/** Public component API. Cross-component consumers import this entry point. */
export * from './context-layout.ts';
export * from './context-validation.ts';
export * from './local-path.ts';
export * from './source-context.ts';
export * from './world-schema.ts';
export * from './analysis-merge.ts';
export * from './analysis-request.ts';
export * from './source-snapshot.ts';
export * from './presentation.ts';
export * from './world-context.ts';
// The World's saved Service context: hourly sync of each connected Service into snapshots, the one search and read
// across them (`world_context`) and the selected Notion pages. Connectors (context/accounts) sign in and read; Context keeps.
export {SERVICE_SYNC_LIMITS,SERVICE_SYNC_DEFAULTS,SERVICE_SYNC_DEFAULT_MINUTES,serviceSyncDefaultId,serviceSyncDefaultPreset,serviceSyncDefaultStep,serviceSyncLine,serviceSyncReadKey,configureServiceSync,serviceSyncStart,serviceSyncFailure,serviceSyncPage,finishServiceSyncPage} from './service-sync.ts';
export {SERVICE_CONTEXT_LIMITS,SERVICE_CONTEXT_REASONS,serviceContext} from './service-context.ts';
export {collectNotionPage,readNotionContext} from './notion-context.ts';
