// The AudioWorklet global scope, for ui/shell/pcm-worklet.ts.
//
// A worklet runs in its own scope with these globals; the DOM library does not
// declare them, and the worklet is the only file that uses them.
declare class AudioWorkletProcessor {
 readonly port: MessagePort;
 constructor();
 process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;
declare const sampleRate: number;
declare const currentTime: number;
