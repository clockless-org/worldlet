import {POPULAR_APPS} from './popular-apps.ts';
import type {AppletDefinition} from '../../contracts/world.ts';
import {APPLET_VARIANTS} from './presentation.ts';
import stripe from './definitions/stripe.ts';
import doordash from './definitions/doordash.ts';
import apple_reminders from './definitions/apple-reminders.ts';
import apple_notes from './definitions/apple-notes.ts';
import plaid from './definitions/plaid.ts';
import oura from './definitions/oura.ts';
import airbnb from './definitions/airbnb.ts';
import gmail from './definitions/gmail.ts';
import google_calendar from './definitions/google-calendar.ts';
import github from './definitions/github.ts';
import notion from './definitions/notion.ts';
import x from './definitions/x.ts';
import youtube from './definitions/youtube.ts';
import tiktok from './definitions/tiktok.ts';
import discord from './definitions/discord.ts';
import strava from './definitions/strava.ts';
import google_maps from './definitions/google-maps.ts';
import codex from './definitions/codex.ts';
import claude_code from './definitions/claude-code.ts';
import weather from './definitions/weather.ts';
import meetings from './definitions/meetings.ts';
import obsidian from './definitions/obsidian.ts';
import voiceMemos from './definitions/voice-memos.ts';
import messages from './definitions/messages.ts';
import docs from './definitions/google-docs.ts';
import sheets from './definitions/google-sheets.ts';
import slides from './definitions/google-slides.ts';
import drive from './definitions/google-drive.ts';
import docker from './definitions/docker.ts';
import supabase from './definitions/supabase.ts';
import todoist from './definitions/todoist.ts';
import linear from './definitions/linear.ts';
import paypal from './definitions/paypal.ts';
import fitbit from './definitions/fitbit.ts';
import tripit from './definitions/tripit.ts';
import browser from './definitions/browser.ts';
import ongoing from './definitions/ongoing.ts';
import {GAME_APPLETS} from './definitions/games.ts';
import {WEB_GAME_APPLETS} from './definitions/web-games.ts';

// Data-only registry: importable by native/web compilers and Node checks without Three.js or DOM.
export const APP_DEFINITIONS: readonly AppletDefinition[] = Object.freeze([gmail,google_calendar,apple_notes,apple_reminders,weather,meetings,github,codex,claude_code,notion,obsidian,voiceMemos,messages,plaid,stripe,paypal,todoist,linear,supabase,docker,drive,docs,sheets,slides,oura,strava,fitbit,google_maps,airbnb,tripit,x,youtube,tiktok,discord,browser,ongoing,doordash,...GAME_APPLETS,...WEB_GAME_APPLETS,...POPULAR_APPS]);
export function getApp(key){return APP_DEFINITIONS.find(app=>app.key===key||app.id===key);}
// Existing world schemas keep their stable flat names during catalog extraction.
// Every definition is in the world: there is no hidden-definition concept any more,
// so a service that is not wanted is deleted rather than kept behind a flag.
export type WorldApp = AppletDefinition & {shape: string; color: string; provider?: string; capability?: string};
export const WORLD_APPS: WorldApp[] = APP_DEFINITIONS.map(app=>({...app,shape:app.scene.template,color:app.scene.color,provider:app.connection.provider,capability:app.connection.capability}));

