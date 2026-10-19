/** Public UI component interface. Keep implementation imports inside this component. */
export {CORE_APPLET_KINDS,coreAppletSource} from './_shared/core-applet-logo.ts';
export {connectionGuide} from './connection-guide.ts';
export {renderMailFocus} from './gmail/focus.ts';
export {renderMailOpen} from './gmail/open.ts';
export {mountAppletScene,sceneMaterialStyle,PLAIN_SCENE,type AppletScene,type AppletSceneRegion,type AppletSceneSource} from './scene/applet-scene.ts';
export {renderSceneList} from './scene/scene-list.ts';
export {appletSceneKey} from './scene/scene-family.ts';
export {createPanelScene} from './scene/panel-scene.ts';
export {setMailAvatarLookup} from './gmail/presentation.ts';
export {createAppletPanel} from './panels.ts';
export {BOARD_READ_EVENT} from './board/panel.ts';
export {createGameApplet} from './games.ts';
export {stripeMoney} from './stripe/panel.ts';
export {appHudIcon,appLogoSource,AGENT_ICONS} from './visuals.ts';
export {createWeatherPanel} from './weather/panel.ts';
export {momentLine} from './moment/panel.ts';
export {requestOngoing,ongoingAsk} from './ongoing/panel.ts';
export {default as xAppIcon} from './x/app-icon.ts';

export {mailMetadata} from './gmail/metadata.ts';
export {renderHomeFocus} from './home-focus.ts';
export {renderHomeOpen,type HomeOpenState} from './home-open.ts';
export {localCalendarItems} from './google-calendar/grid.ts';
export {renderMeetingsOpen} from './meetings/open.ts';
export {renderTranscript,transcriptBar} from './meetings/transcript.ts';
export {curatedOriginal,renderCuratedTable} from './_shared/curated-source-applet.ts';
export {loadMoney,readMoneyItem} from './_shared/money-applets.ts';
export {quietSourceReader} from './_shared/quiet-source-reader.ts';
export {WORK_APPLETS,renderWorkDetail,sampleWork,sampleWorkDetail,workError,workItems} from './_shared/work-applets.ts';
export {searchNotes} from './apple-notes/note-search.ts';
export {createClaudeSession} from './claude-code/claude-session.ts';
export {createCodexApplet} from './codex/codex-applet.ts';
export {createVoiceMemoReader} from './voice-memos/voice-memos.ts';
// What was the browser folder (#714).
export {inspectBrowserOutcome} from './action-outcome.ts';
export {createBrowserPanel} from './browser-device.ts';
// What was the practice folder (#714).
export {PRACTICE_BUILD_MS,createPracticeJob,practiceJobDetail,practiceJobSession} from './practice-coding.ts';
export {mountPracticeTimer,practiceTimerHTML} from './practice-timer.ts';
export {createPracticeWalkthrough} from './practice-walkthrough.ts';
export {tennisCard} from './tennis-card.ts';
export {tennisDemo} from './tennis-demo.ts';
export * from './game-boards.ts';
