import {homeWritePlan} from './home-actions.ts';

const stable=(v:any):string=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const fields=['id','content','description','dueDate','recurring','deadlineDate','priority','projectId','sectionId','parentId','labels','duration','responsibleUid','isUncompletable','assignedByUid','isDeleted','checked'];
/** Source facts arrive from IO. Eligibility, stale-review rejection and copy belong to Core. */
export function todoistWriteReview(input:any){
 const plan=homeWritePlan(input.plan),source=input.source,row=source?.object;
 if(plan.provider!=='todoist'||!row||row.id!==plan.id)throw Error('Todoist returned a different task. Reopen the task.');
 if(typeof row.content!=='string'||!row.content.trim()||typeof row.description!=='string'||typeof row.projectId!=='string'||!row.projectId)throw Error('Todoist did not return the complete task.');
 if(row.checked!==false||row.recurring!==false||row.isDeleted||row.isUncompletable)throw Error('Use Todoist Web for recurring, completed or unavailable tasks.');
 if(source.childCount!==0||source.childrenError||source.hasMoreChildren||!Array.isArray(source.children)||source.children.length)throw Error('Use Todoist Web for tasks with subtasks or unavailable subtask information.');
 const snapshot=Object.fromEntries(fields.map(key=>[key,row[key]??null]));
 if(input.expected&&stable(input.expected.snapshot)!==stable(snapshot))throw Error('This task changed after review. Read it again and prepare a new change.');
 return {snapshot,targetTitle:row.content,destination:'Todoist · '+row.projectId,description:row.description,notice:'Mark this task complete in Todoist. This task is not recurring and has no active subtasks.'};
}

export function todoistWriteResult(input:any){
 const id=input.id,result=input.result,receipt=result?.receipt,row=result?.observed?.object;
 if(receipt?.successCount!==1||receipt?.failureCount!==0||receipt?.totalRequested!==1||!Array.isArray(receipt.completed)||receipt.completed.length!==1||receipt.completed[0]!==id||!Array.isArray(receipt.failures)||receipt.failures.length||row?.id!==id||row?.checked!==true||row?.isDeleted)throw Error('The Todoist completion could not be verified. Check Todoist before trying again.');
 return {status:'verified',id};
}
