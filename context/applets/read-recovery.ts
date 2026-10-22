// Only explicit authorization/configuration failures need a person. A timeout,
// busy host, interrupted read or unknown error is recoverable, not an alert.
export function sourceReadAction(value:any):'reconnect'|'permissions'|null {
 if(['reconnect','permissions'].includes(value?.requiredAction))return value.requiredAction;
 const code=String(value?.code||value?.errorCode||value?.syncStatus||value?.status||'').toLowerCase();
 const message=String(value?.syncError||value?.message||value?.error||'');
 if(['expired','revoked','auth_required','invalid_grant','unauthorized'].includes(code)||/sign.in expired|authorization expired|invalid_grant|reconnect (?:with fox|gmail|google)|please reconnect|^reconnect\b|token.*revoked/i.test(message))return 'reconnect';
 if(['permission_denied','access_denied'].includes(code)||/full disk access|folder access expired|choose the folder again|permission (?:denied|required)|grant .* access/i.test(message))return 'permissions';
 return null;
}
export const readRetryDelay=(failures:number)=>Math.min(300000,15000*2**Math.min(Math.max(0,failures-1),5));
