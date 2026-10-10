/** Request admission policy; hosts own cancellation and process handles. */
const passive=new Set(['snapshot','modelStatus','modelHealth','diagnostics','agentToolResult','usageEvent','companionProfile','conversationRecall','browserLayout','browserPip','worldAudio','backgroundMusic','weatherLoad','foxTiming','agentWarm','setTextScale','saveSampleUI']);
const preferences=new Set(['text_size','attention_focus','companion_motion','spoken_replies','spoken_voice','companion_name','companion_look','companion_style','morning_brief','usage_analytics']);
export function interruptsBackground(request):boolean {
 if(passive.has(request.action))return false;
 if(request.action==='foxPreferences')return request.cloudConsent!=null;
 if(request.action==='foxPreferenceChange')return !preferences.has(request.setting);
 if(request.action==='onboarding')return !['setup','complete','checkMail'].includes(request.operation);
 return true;
}
