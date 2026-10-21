/** Public UI component interface. Keep implementation imports inside this component. */
export {mountAttentionPreview,setAttentionImageLookup} from './attention-preview.ts';
export {taskReviewLine} from './task-review.ts';
export {FOX_MAIN_THREAD,cleanRecall,contextThread,restoredMainHistory} from './context-recall.ts';
export {attentionIcon} from './icon.ts';
export {attentionSceneArt} from './scene-art.ts';
export {collectMatters} from '../../agent/attention/index.ts';
export {eventWhen} from '../../agent/attention/index.ts';
export {attentionReturnWhen,attentionGroupWhen} from '../../agent/attention/index.ts';
// What was the artifacts folder (#714).
export {mountFoxArtifact} from './fox-artifact.ts';
export {createCompanionArtifacts} from './companion-artifacts.ts';
export {mountJournalBook,flyIntoJournal} from './journal-book.ts';
export {artifactPageSpec} from './artifact-spec.ts';
export {turnIntoDock} from './artifact-turn.ts';
export {createDailyCards,type DailyCardsHost} from './daily-cards.ts';
export {createArtifactHost,type ArtifactHostOptions} from './artifact-host.ts';
