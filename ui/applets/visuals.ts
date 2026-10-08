import {popularLogos} from './popular-logos.ts';
import voiceMemosLogo from './voice-memos/logo.ts';
import doordashLogo from './doordash/logo.ts';
import stripeLogo from './stripe/logo.ts';
import plaidLogo from './plaid/logo.ts';
import ouraLogo from './oura/logo.ts';
import airbnbLogo from './airbnb/logo.ts';
import githubLogo from './github/logo.ts';
import notionLogo from './notion/logo.ts';
import xLogo from './x/logo.ts';
import youtubeLogo from './youtube/logo.ts';
import tiktokLogo from './tiktok/logo.ts';
import discordLogo from './discord/logo.ts';
import stravaLogo from './strava/logo.ts';
import google_mapsLogo from './google-maps/logo.ts';
import codexLogo from './codex/logo.ts';
import claudeCodeLogo from './claude-code/logo.ts';
import obsidianLogo from './obsidian/logo.ts';
import paypalLogo from './paypal/logo.ts';
import fitbitLogo from './fitbit/logo.ts';
import tripitLogo from './tripit/logo.ts';
// Generic Home Applets (Mail, Calendar, Notes, Reminders, Weather, Browser) have no brand logo here.
const logoDrawers={'voice-memos':voiceMemosLogo,'doordash':doordashLogo,'stripe':stripeLogo,'plaid':plaidLogo,'oura':ouraLogo,'airbnb':airbnbLogo,'codex':codexLogo,'claude-code':claudeCodeLogo,'github':githubLogo,'notion':notionLogo,'x':xLogo,'youtube':youtubeLogo,'tiktok':tiktokLogo,'discord':discordLogo,'strava':stravaLogo,'google-maps':google_mapsLogo,'obsidian':obsidianLogo,'paypal':paypalLogo,'fitbit':fitbitLogo,'tripit':tripitLogo};

// A website made into an Applet from the Browser carries its own site's icon (core/applets/site-applet.ts).
export function appLogoSource(app){return popularLogos[app.key]||logoDrawers[app.key]?.source||(app.site&&app.icon)||undefined;}
// Only genuine brand identity belongs beside an Applet name. No generic fallback.
export function appHudIcon(app){return {source:appLogoSource(app)||''};}
