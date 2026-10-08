/** Keep source text intact; fixed metadata is distinct from the task description. */
export function curatedOriginal(value:any){
 const labels={modified:'Modified',type:'File type',dueDate:'Due',deadlineDate:'Deadline',priority:'Priority',projectId:'Project ID',labels:'Labels',recurring:'Repeats',checked:'Completed',parentId:'Parent task ID',responsibleUid:'Assigned user ID',duration:'Duration',status:'Status',project:'Project',team:'Team',assignee:'Assignee',cycle:'Cycle',updatedAt:'Updated',createdAt:'Created'};
 const details=Object.entries(value.details||{}).map(([key,v])=>`${labels[key]||key}: ${Array.isArray(v)?v.join(', '):String(v)}`).join('\n');
 return {...value,text:[value.text??value.description??'',details].filter(Boolean).join('\n\n')};
}

/** Provider cells are text, never HTML or spreadsheet formulas executed in the UI. */
export function renderCuratedTable(rows:string[][]){
 const table=document.createElement('table');table.className='curated-source-table';
 const caption=document.createElement('caption');caption.textContent='First worksheet';table.append(caption);
 const body=document.createElement('tbody');table.append(body);
 for(const row of rows){const tr=document.createElement('tr');body.append(tr);for(const cell of row){const td=document.createElement('td');td.textContent=String(cell);tr.append(td);}}
 return table;
}
