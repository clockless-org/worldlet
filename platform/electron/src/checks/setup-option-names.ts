// The RC setup options (#1503), without Electron imports: scripts/setup-options.ts launches one
// development build per option with WORLDLET_SETUP_OPTION, and checks/setup-options.ts walks it.
export const SETUP_OPTIONS=['google','codex','claude-code','hermes','openclaw','pi'] as const;
export type SetupOption=typeof SETUP_OPTIONS[number];
