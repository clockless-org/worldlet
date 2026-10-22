import {SERVICE_PROVIDERS,type ServiceRead} from '../../../../contracts/services.ts';
import {readServicePresetRead} from '../../../../context/connectors/index.ts';
import {admitServiceRead} from './service-source.ts';
import type {ServiceSource} from './service-source.ts';
import type {McpSource} from './mcp-source.ts';

/** Owner-configured collector only: validated Service reads, no Harness fallback and no conversational payload journal.
 * The sync job's authorization/lease is checked by service-sync before dispatch and again at commit. The existing
 * bounded readers still own endpoint, vault, transport and read-only operation checks. */
export async function collectServicePage(sources:{mcp:Pick<McpSource,'read'>&Partial<Pick<McpSource,'collectNotionPage'>>;services:Pick<ServiceSource,'read'>},request:ServiceRead,signal:AbortSignal){
 if(signal.aborted)throw Error('Service sync cancelled.');
 if(request.provider==='notion'){
  const {provider,...input}=request,read=readServicePresetRead(provider,input);
  if(!sources.mcp.collectNotionPage)throw Error('World Notion collection is unavailable.');
  const result=await sources.mcp.collectNotionPage(read.id!);
  if(signal.aborted)throw Error('Service sync cancelled.');
  return result;
 }
 const {provider,body}=await admitServiceRead({...request},SERVICE_PROVIDERS,async()=>({ok:true}));
 const result=await (provider==='github'?sources.mcp:sources.services).read(provider,body);
 if(signal.aborted)throw Error('Service sync cancelled.');
 return result;
}
