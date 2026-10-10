/** Public Theme Pack interface: the registry, the contract and its presentation helpers. */
export {ACTIVE_THEME,DEFAULT_THEME_ID,theme,themeAppletArt,type AppletArt,type RegisteredTheme} from './theme-registry.ts';
export {THEME_EVENTS,THEME_SKIN_PARTS,companionPerformance,parseThemePack,themePath,type ThemeEvent,type ThemePack,type ThemeSkinPart} from './theme-pack.ts';
export {createThemeEvents,type ThemeCue,type ThemeOccurrence} from './theme-events.ts';
export {PINS_THEME,selectThemePins,storedThemePins,switchThemePins,type ThemePins,type ThemePlacementLayout} from './theme-placements.ts';

export {createMailArrivalObserver} from './mail-arrival.ts';
export {validateSceneMotion,type SceneMotion} from './scene-motion.ts';
export type {ThemeDeviceFeature,ThemeDeviceEffects,ThemeMailDelivery} from './theme-pack.ts';
export {applyThemeSurfaces,attentionPicture,companionStill,playThemeSound,syncThemeSounds,themeStartupPicture,themeSurfaces,type BuiltSurfaces} from './theme-surfaces.ts';

export {themeAmbientTrack} from './theme-audio.ts';

export * from './build-theme-contract.ts';

// The one Theme contract: bundled packages, the active one and the one-step switch.
export {renderBuildTheme,renderBuildWorld,applyBuildThemeScene,activeBuildTheme,hostAppletPages,themeAssetURL,themeAppletIcon,BUILD_THEMES,DEFAULT_BUILD_THEME_ID,type InstalledTheme,type ThemePackage} from './build-theme.ts';
