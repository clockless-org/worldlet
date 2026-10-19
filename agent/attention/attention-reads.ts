/** Shared, bounded collection coverage. No model or unread-state dependency. */
export function attentionReads(provider:string):{provider:string;limit:number;query?:string}[]{
 if(provider!=='gmail')return [{provider,limit:20}];
 return [
  {provider,query:'newer_than:30d',limit:20},
  {provider,query:'newer_than:90d {"confirmed" "confirmation" "appointment" "reservation" "booking" "itinerary" "ticket" "registration" "registered" "conference" "报名" "门票" "大会" "已确认" "预约" "预订" "行程"}',limit:10},
  {provider,query:'newer_than:30d {"deadline" "due date" "please confirm" "RSVP" "action required" "截止" "请确认" "到期"}',limit:10},
  {provider,query:'newer_than:30d {"renewal" "renews" "trial ends" "续费" "试用到期"}',limit:10},
 ];
}
