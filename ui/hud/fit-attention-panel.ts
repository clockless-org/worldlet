/** Keep the existing trim priority, but search the fitting prefix in O(log n)
 * layouts instead of removing one row and forcing layout up to 120 times. */
export function fitAttentionPanel(list:HTMLElement){
 const height=list.clientHeight;if(!height||list.scrollHeight<=height+1)return;
 const groups=Array.from(list.querySelectorAll<HTMLElement>('.world-task-group')).map(node=>({node,children:Array.from(node.children),rows:Array.from(node.querySelectorAll<HTMLElement>('.world-matter'))}));
 // Trailing non-group controls (e.g. the Later button) always stay and count toward the height.
 const trailing=Array.from(list.children).filter(child=>!child.classList.contains('world-task-group'));
 const counts=groups.map(g=>g.rows.length),order:number[]=[];
 for(let i=0;i<120;i++){
  const live=groups.map((g,index)=>({g,index,count:counts[index]})).filter(g=>g.count);
  if(!live.length)break;
  const removable=live.filter(({g,count})=>count>(g.node.dataset.group==='event'?3:1));
  const chosen=(removable.length?removable:live).reduce((a,b)=>b.count>=a.count?b:a);
  counts[chosen.index]--;order.push(chosen.index);
 }
 const apply=(removed:number)=>{
  const keep=groups.map(g=>g.rows.length);for(let i=0;i<removed;i++)keep[order[i]]--;
  for(const [index,g] of groups.entries()){
   const trimmed=new Set(g.rows.slice(keep[index]));
   g.node.replaceChildren(...g.children.filter(child=>!trimmed.has(child as HTMLElement)));
  }
  list.replaceChildren(...groups.filter((g,i)=>keep[i]>0||g.rows.length===0).map(g=>g.node),...trailing);
 };
 if(!order.length)return;
 let low=1,high=order.length;
 while(low<high){const middle=(low+high)>>1;apply(middle);if(list.scrollHeight<=list.clientHeight+1)high=middle;else low=middle+1;}
 apply(low);
}
