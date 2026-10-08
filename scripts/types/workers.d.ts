// serve-website runs the worker under Node. The Workers globals it touches are
// declared here so this program can check it without the Workers lib, which
// cannot share a program with the DOM lib the checks compile against.
type WorkerSocket=WebSocket&{accept(): void};
declare const WebSocketPair: new()=>{0: WorkerSocket; 1: WorkerSocket};
interface ResponseInit {
 webSocket?: WebSocket;
}
