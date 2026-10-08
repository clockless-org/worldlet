import type {FoxForegroundActivity} from '../../contracts/companion-activity.ts';

// Exact World implementation IDs, never user text or localized status wording.
// Unknown Harness tools do not claim a specific action. Harnesses may provide
// an optional validated presentation phase through the common Agent protocol.
const activities:Readonly<Record<string,FoxForegroundActivity>>={
 inspect_world:'checking',find_content:'searching',read_content:'reading',read_content_page:'reading',
 read_world_source:'reading',read_connected_google:'reading',read_world_history:'reading',read_companion_archive:'reading',
 create_content:'drafting',patch_content:'drafting',prepare_email:'drafting',
 delete_content:'organizing',restore_content:'organizing',undo_content:'organizing',archive_world_items:'organizing',upsert_world_items:'organizing',
 query_world_items:'checking',review_world_item:'checking',list_deleted:'checking',list_codex_tasks:'checking',read_codex_task:'checking',
 describe_world_tools:'checking',delegate_codex:'working'
};
export function toolAnimationActivity(name:string,args:Record<string,unknown>={}):FoxForegroundActivity{
 if(name==='browse_web'&&['read','records','record','outline'].includes(String(args.operation)))return 'reading';
 if(name==='automate_browser'&&args.operation==='snapshot')return 'reading';
 return activities[name]||'working';
}
export function stageAnimationActivity(stage:string):FoxForegroundActivity{return stage==='waiting'?'awaiting_service':'thinking';}
