import AVFoundation
import Observation
import Speech
import WorldletKit

/// Hold to talk to Fox. Speech is recognized on this iPhone only (`requiresOnDeviceRecognition`): no audio leaves
/// the phone or is kept, and only the recognized text goes to the computer, as a typed line would.
@MainActor @Observable
final class VoiceInput {
    enum State: Equatable { case idle, listening, unavailable(String) }

    private(set) var state: State = .idle
    /// The words heard so far in this hold.
    private(set) var transcript = ""
    /// How loud the microphone hears the person right now, 0 to 1, for the sound wave.
    private(set) var level: Double = 0

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var finished: CheckedContinuation<String, Never>?
    private var hold = 0

    var listening: Bool { state == .listening }

    /// Starts listening in the language of `lastLine` (the person's latest line to Fox), else the phone's own
    /// (`SpeechLanguage`); asks for speech and microphone permission the first time. `echoCancelled` listens through
    /// the iPhone's voice processing (`.voiceChat`, as a call does) so Talk can hear the person while Fox speaks.
    func start(lastLine: String? = nil, echoCancelled: Bool = false) async {
        guard state != .listening else { return }
        hold += 1
        transcript = ""
        level = 0
        guard await Self.authorized() else {
            state = .unavailable("Allow Speech Recognition and the microphone for Worldlet in Settings to talk to Fox.")
            return
        }
        let identifier = SpeechLanguage.locale(lastLine: lastLine, preferred: Locale.preferredLanguages,
                                               supported: SFSpeechRecognizer.supportedLocales().map(\.identifier))
        recognizer = identifier.flatMap { SFSpeechRecognizer(locale: Locale(identifier: $0)) } ?? SFSpeechRecognizer()
        guard let recognizer, recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            state = .unavailable("Voice needs on-device speech recognition for your language. You can type to Fox instead.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            if echoCancelled {
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .duckOthers])
            } else {
                try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            }
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.requiresOnDeviceRecognition = true
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            self.request = request
            let input = engine.inputNode
            if input.isVoiceProcessingEnabled != echoCancelled { try input.setVoiceProcessingEnabled(echoCancelled) }
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { [weak self] buffer, _ in
                request.append(buffer)
                let loudness = Self.loudness(buffer)
                Task { @MainActor in self?.level = loudness }
            }
            engine.prepare()
            try engine.start()
            state = .listening
            let id = hold
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let done = error != nil || (result?.isFinal ?? false)
                Task { @MainActor in self?.heard(text, done: done, hold: id) }
            }
        } catch {
            teardown()
            state = .unavailable("The microphone is not available right now.")
        }
    }

    /// Stops listening and returns everything heard (empty when nothing was).
    func stop() async -> String {
        // Recognition can end on its own (a long pause or its time limit); what it heard still counts.
        guard state == .listening else { return transcript.trimmingCharacters(in: .whitespacesAndNewlines) }
        let current = hold
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        // The recognizer delivers its final result shortly after the audio ends; don't wait longer than a moment.
        let text = await withCheckedContinuation { continuation in
            finished = continuation
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(1.5))
                self.heard(nil, done: true, hold: current)
            }
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Stops listening and throws away what was heard (the person slid the recording away).
    func cancel() async {
        _ = await stop()
        transcript = ""
    }

    func dismissProblem() { if case .unavailable = state { state = .idle } }

    private func heard(_ text: String?, done: Bool, hold id: Int) {
        // A late answer from an earlier hold must not end this one.
        guard id == hold else { return }
        if let text { transcript = text }
        guard done else { return }
        if let finished {
            self.finished = nil
            finished.resume(returning: transcript)
        }
        teardown()
    }

    private func teardown() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        task?.cancel()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        level = 0
        if state == .listening { state = .idle }
    }

    /// A buffer's loudness on a 0-1 scale: its RMS in decibels, from -50 dB (quiet) to -10 dB (speaking up).
    nonisolated private static func loudness(_ buffer: AVAudioPCMBuffer) -> Double {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
        let rms = (sum / Float(buffer.frameLength)).squareRoot()
        let db = 20 * log10(max(rms, 1e-7))
        return Double(min(max((db + 50) / 40, 0), 1))
    }

    private static func authorized() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
