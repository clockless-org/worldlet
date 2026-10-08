import type {AttentionBudget} from '../../contracts/attention.ts';

/** Local consumer guard, independent of provider/model-service token allowances. */
export const ATTENTION_DAILY_ATTEMPTS=240;
export function attentionAdmission(budget:AttentionBudget,now:number){
 const day=Math.floor(now/86400);
 const attempts=budget.day===day?Math.max(0,budget.attempts||0):0;
 const exhausted=attempts>=ATTENTION_DAILY_ATTEMPTS;
 const nextAt=Math.max(budget.nextAt||0,exhausted?(day+1)*86400:0);
 return {ready:nextAt<=now,nextAt,waitReason:exhausted?'model_budget':nextAt>now?'retry_at':null,
  attempts,limit:ATTENTION_DAILY_ATTEMPTS};
}
