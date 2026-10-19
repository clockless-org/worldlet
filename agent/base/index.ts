// What was the diagnostics folder (#714).
export * from './fox-timing.ts';
export * from './report.ts';
export * from './setup-events.ts';
export * from './native-crash.ts';
export * from './device-class.ts';
export * from './data-size.ts';
export * from './graphics-mode.ts';
export {redactDiagnosticText,diagnosticLineCapture} from './redaction.ts';
// What was the distribution folder (#714).
export {calendarParts,displayReleaseVersion,nativeReleaseVersion,releaseTag} from './release-version.ts';
export {LOGIN_ITEM_ARG,loginItemOfferDue,loginItemOn,loginItemStatus,loginItemText,openedAtLogin,releaseLaunch,type LoginItemSettingsFacts,type LoginItemStatus} from './login-item.ts';
export {defaultBrowserSupported,defaultBrowserText,incomingLink,linksInArguments,type DefaultBrowserStatus} from './default-browser.ts';
export {DEFAULT_UPDATE_CHANNEL,UPDATE_CHANNELS,demotedChannel,followedChannel,isUpdateChannel,pickUpdate,switchUpdateChannel,updateChannelOptions,updateChannelSwitchable,type UpdateChannel,type UpdateChannelOption} from './update-channel.ts';
