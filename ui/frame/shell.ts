/** Public UI component interface. Keep implementation imports inside this component. */
export {musicReply} from '../world/index.ts';
export {collectNativeActions,upcomingEvents} from '../../agent/attention/index.ts';
export {runAudioCommand} from './native-audio.ts';
export {mountNotionWorld} from './notion-world.ts';
export {errorFields,withFoxTurnAnalytics,withProductAnalytics,withToolAnalytics,eventTrigger,reportEngagement,reportProductEvent,personGesture,startWebAnalytics} from './product-analytics.ts';
export {isRequestCancellation} from './request-cancellation.ts';
export {mountWorldAudio} from '../world/index.ts';
export {mountLocalMusic,runLocalMusicTool} from '../world/index.ts';
export {celebrateWorld,celebrateWin} from '../world/index.ts';
export {WORLD_FACTS,worldNow} from '../world/index.ts';
export {snapshotInbox} from './snapshot-inbox.ts';
// What was the onboarding folder (#714).
export {firstWinCandidate} from './first-win.ts';
export {landSetupDevices} from './setup-arrival.ts';
export {mountStartupSetup} from './startup-setup.ts';
export {mountWorldOnboarding} from './world-onboarding.ts';
export {mountFirstValue} from './first-value.ts';
export {mountWorldTour} from './world-tour.ts';
export {setupText} from './setup-language.ts';
export {mountLoginItemOffer} from './login-item-offer.ts';
export {mountDesktopCompanionHint,desktopCompanionHintText} from './desktop-companion-hint.ts';
// What was the distribution folder (#714).
export {latestMacRelease,mountMacDownload} from './mac-release.ts';
export {displayReleaseVersion} from './release-version.ts';
export {latestWindowsPreview,microsoftStoreUrl} from './windows-release.ts';
export {phoneApps,visitorSystem} from './phone-release.ts';
