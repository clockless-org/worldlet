// Preserve cancellation across the string-only WKWebView error bridge.
export function isRequestCancellation(error){
 return error?.name==='AbortError'||/Swift\.CancellationError|^The request was cancelled\.$/.test(String(error?.message||error||''));
}
