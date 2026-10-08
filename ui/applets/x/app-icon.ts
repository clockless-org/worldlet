// Compact app-tile treatment; the publisher's large outline artwork is unreadable at 32px.
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f1419"/><path fill="#fff" transform="translate(13 13) scale(1.5833)" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933Zm-1.29 19.49h2.039L6.487 3.24H4.3l13.31 17.403Z"/></svg>';
export default 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
