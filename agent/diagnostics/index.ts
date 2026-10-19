/** Public component API. Cross-component consumers import this entry point. */
export * from './fox-timing.ts';
export * from './report.ts';
export * from './setup-events.ts';
export * from './native-crash.ts';
export * from './device-class.ts';
export * from './data-size.ts';
export * from './graphics-mode.ts';
export {redactDiagnosticText,diagnosticLineCapture} from './redaction.ts';
