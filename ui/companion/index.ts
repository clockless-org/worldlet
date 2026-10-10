/** Public UI component interface. Keep implementation imports inside this component. */
export {installDesktopCompanion} from './desktop-companion.ts';
export {createFoxDevPreviewControls} from './fox-dev-preview.ts';
export {FOX_WORKING,foxDoing} from './fox-doing.ts';
export {FOX_STATUS_EVENT} from './fox-name-tag.ts';
export {mountEmailReview,presentEmailReview} from './fox-email-review.ts';
export {renderFoxFrameTiming} from './fox-frame-timing.ts';
export {mountMemoryManager} from './fox-memory-manager.ts';
export {mountNotionReview} from './fox-notion-review.ts';
export {createFoxPreferences} from './fox-preferences.ts';
export {mountWriteNotice} from './fox-write-notice.ts';
export {mountHarnessApproval} from './fox-harness-approval.ts';
export {mountChannelReply} from './fox-channel-reply.ts';
export {mountHarnessCall} from './fox-call.ts';
export {createNativeCompanion} from './native-companion.ts';
export {isDesktopCompanion,requireWorldSurface} from './world-surface.ts';

export {mountHomeReview} from './fox-home-review.ts';
export {helpNarration,narrateHelp} from './help-narration.ts';
export {mountPhoneBridge} from './phone-bridge.ts';
export {pairingQR} from './companion-phone.ts';
