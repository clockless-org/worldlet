/** Public UI component interface. Keep implementation imports inside this component. */
export {mountAttentionPreview,setAttentionImageLookup} from './attention-preview.ts';
export {taskReviewLine} from './task-review.ts';
export {FOX_MAIN_THREAD,cleanRecall,contextThread,restoredMainHistory} from './context-recall.ts';
export {attentionIcon} from './icon.ts';
export {attentionSceneArt,attentionSceneIds} from './scene-art.ts';
export {collectMatters} from '../../agent/attention/index.ts';
export {eventWhen} from '../../agent/attention/index.ts';
export {attentionReturnWhen,attentionGroupWhen} from '../../agent/attention/index.ts';
