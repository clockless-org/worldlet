/** Public UI component interface. Keep implementation imports inside this component. */
export {coreAppletItems,calendarDay} from './applet-content.ts';
export {forecastStage,weatherGlyph} from './environment/weather-forecast.ts';
export {WEATHER_TTL,environmentAt,forecastParams,normalizeWeather,validPlace,weatherKind} from './environment/world-environment.ts';
export {createModuleScene} from './world-scene.ts';
export {applyRegionLayout,lastUse,moveRegionApplet,parseRegionLayout,pinRegionApplet,pinnedPlace,readRegionLayout,recentlyUsedFirst,recordAppletUse,regionId,storedRegionLayout} from './region-layout.ts';
export {makeSampleWorld} from './sample-data.ts';
export {roomObjects} from './sample-hierarchy.ts';
export {SAMPLE_DATASET_ID} from './sample-persona.ts';
export {resolvePlacements} from './slot-placement.ts';
export {mountTravelExperiment} from './travel-experiment.ts';
export {APPLET_OPTICAL_SCALE,APPLET_OVERVIEW_WIDTH,WORLD_HEIGHT,WORLD_WIDTH} from './world-design.ts';
export {WORLD_LAYOUT} from './world-layout.ts';
export {applyModuleWorld,moduleStatus} from './world-modules.ts';
export {WORLD_PRESETS,applyPersonalWorld} from './world-presets.ts';
export {attachBrowserDevice} from './browser-sample.ts';
export {createWorldProjector} from './world-projection-client.ts';

export {lampLabels} from './applet-lamp.ts';
export {FOX_FRAME_RATE,WORLD_FRAME_RATE,foxFrameRate,frameDue,windowActive,worldFrameRate} from './frame-budget.ts';

export {createMailArrival} from './mail-arrival.ts';

export {THEME_SCENE} from './theme-scene.ts';
export {mountLocalMusic,runLocalMusicTool} from './local-music.ts';
export {musicReply} from './music-command.ts';
export {describePlace} from './notion-places.ts';
export {mountWorldAudio} from './world-audio.ts';
export {celebrateWin,celebrateWorld} from './world-celebration.ts';
export {mountWorldEnvironment} from './world-environment.ts';
export {WORLD_FACTS,worldNow} from './world-now.ts';
export {WORLD_REVEAL_MS,dissolveWorldSurface} from './world-reveal.ts';
export {bindWorldViewport} from './world-viewport.ts';
