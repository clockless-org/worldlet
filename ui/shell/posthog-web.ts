// PostHog's standard web client for the World page, a bundle of its own (posthog-web.js) that the page loads only when
// the host allows it (startWebAnalytics in product-analytics.ts). Owner decision 2026-10-10: follow PostHog's best
// practice for product analytics, session replay included. What it sends (core/diagnostics/ANALYTICS.md, "World page
// web capture"):
// - autocapture (clicks, changes, submits) with every element's text and attributes masked, one $pageview and
//   $pageleave so sessions have a length, heatmaps and dead clicks;
// - session replay with all text and inputs masked and images, video, canvas and frames blocked: the layout and the
//   pointer, never readable mail, chat or Fox content;
// - the same identity and installation properties as the host's own events.
// Nothing loads from the network: the no-external build carries replay, and the host forwards worldlet://app/ingest/…
// to PostHog. Surveys, product tours, conversations, the toolbar and feature flags stay off.
import posthog from 'posthog-js/full/no-external';

type Config={key:string,apiHost:string,distinctId:string,identified:boolean,properties:Record<string,unknown>};
const scope=window as any;
let current:Config|null=null,started=false;

function start(config:Config){
 posthog.init(config.key,{
  api_host:config.apiHost,
  ui_host:'https://us.posthog.com',
  defaults:'2025-11-30',
  person_profiles:'identified_only',
  bootstrap:{distinctID:config.distinctId,isIdentifiedID:config.identified},
  persistence:'localStorage',
  autocapture:true,
  capture_pageview:true,
  capture_pageleave:true,
  capture_dead_clicks:true,
  enable_heatmaps:true,
  mask_all_text:true,
  mask_all_element_attributes:true,
  mask_personal_data_properties:true,
  save_referrer:false,
  ip:false,
  session_recording:{maskAllInputs:true,maskTextSelector:'*',blockSelector:'img,video,canvas,iframe,image,[data-private]',recordHeaders:false,recordBody:false},
  // Whatever the project settings say: console lines can carry text, and request timings carry URLs (a mail picture's
  // address, for one). Web vitals are numbers only.
  enable_recording_console_log:false,
  capture_performance:{network_timing:false,web_vitals:true},
  disable_external_dependency_loading:true,
  disable_surveys:true,
  disable_product_tours:true,
  disable_conversations:true,
  advanced_disable_feature_flags:true,
  advanced_disable_toolbar_metrics:true,
  loaded:instance=>instance.register(config.properties),
 } as any);
 started=true;
}

function update(config:Config|null){
 if(!config){if(started){posthog.stopSessionRecording();posthog.opt_out_capturing();}current=null;return;}
 if(!started){current=config;start(config);return;}
 if(posthog.has_opted_out_capturing()){posthog.opt_in_capturing();posthog.startSessionRecording();}
 // Signed in since (the host's identity is now the Google account), or signed out (a fresh anonymous person).
 if(current&&config.distinctId!==current.distinctId){if(config.identified)posthog.identify(config.distinctId);else posthog.reset();}
 posthog.register(config.properties);
 current=config;
}

scope.worldletWebAnalytics={update};
update(scope.worldletWebAnalyticsConfig??null);
