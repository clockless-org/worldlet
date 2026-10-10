/** Public UI component interface. Keep implementation imports inside this component. */
export {CORE_APPLET_KINDS,coreAppletSource} from './_shared/core-applet-logo.ts';
export {connectionGuide} from './connection-guide.ts';
export {renderMailFocus} from './gmail/focus.ts';
export {renderMailOpen} from './gmail/open.ts';
export {setMailAvatarLookup} from './gmail/presentation.ts';
export {createAppletPanel} from './panels.ts';
export {createGameApplet} from './games.ts';
export {stripeMoney} from './stripe/panel.ts';
export {appHudIcon,appLogoSource} from './visuals.ts';
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
