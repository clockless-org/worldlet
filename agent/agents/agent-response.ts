import type {AgentEvent} from '../../contracts/agent.ts';

/** Pure stream accumulation shared by every Agent and native host.
 * A new response, tool phase or accepted steering starts a fresh segment.
 */
export function reduceAgentResponse(text:string,event:AgentEvent):string {
 switch(event.type){
  case 'delta':return text+event.text;
  case 'response_start':case 'progress':case 'steered':return '';
  default:return text;
 }
}
