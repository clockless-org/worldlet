/** Stable Platform ↔ Harness executable protocol. Transport fields never reach UI. */
import type {AgentCapabilities, AgentEvent} from './agent.ts';
export type HarnessHello={type:'hello';protocolVersion:1;id:string;capabilities:AgentCapabilities};
export type HarnessTurn={requestId:string;action:string;capabilities:AgentCapabilities;toolIDs:string[];finished:boolean};
export type HarnessDelivery={state:HarnessTurn;kind:'event';event:AgentEvent}
 |{state:HarnessTurn;kind:'result';value:Record<string,unknown>}
 |{state:HarnessTurn;kind:'error';message:string}
 |{state:HarnessTurn;kind:'steer';controlId:string;accepted:boolean}
 |{state:HarnessTurn;kind:'host';frame:Record<string,unknown>}
 |{state:HarnessTurn;kind:'stale'};

/** Shared host-owned entities; wire streaming frames remain the protocol above. */
export type {RuntimeTask,RuntimeRun,ExecutionEvent} from './execution.ts';
