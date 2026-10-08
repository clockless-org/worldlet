import AVFoundation
import Observation
import WorldletKit

/// Talk with Fox (owner parity plan item 7), held from Fox's menu in the dock: listen on this iPhone, send each
/// utterance as a line (`TalkPause` decides when the person stopped), read Fox's finished reply with the system voice
/// (AVSpeechSynthesizer), then listen again. While Fox speaks the microphone stays open through the iPhone's echo
/// cancellation (`VoiceInput` with `echoCancelled`), and words of the person's own (`TalkRules.interruption`) stop the
/// voice and become the next line; a tap on the microphone interrupts too. A short "be quiet" (`TalkRules.quietRequest`)
/// keeps Talk without the voice. Speech stays on the phone as in hold-to-talk; only the words go to the computer.
@MainActor @Observable
final class TalkMode {
    enum Phase: Equatable { case off, listening, thinking, speaking }

    private(set) var phase = Phase.off
    /// The person asked for quiet: replies are shown, not read, until Talk ends.
    private(set) var quiet = false

    private let synthesizer = AVSpeechSynthesizer()
    private let ending = SpeechEnd()
    private var loop: Task<Void, Never>?
    private var voice: VoiceInput?
    private var spoken: CheckedContinuation<Void, Never>?
    /// The person talked over Fox's last reply; its words are what the open microphone heard after Fox's own.
    private var bargedIn = false

    var on: Bool { phase != .off }

    init() {
        synthesizer.delegate = ending
        ending.ended = { [weak self] in self?.finishSpeaking() }
    }

    /// Starts Talk; `say` sends a line where a typed one would go now (the open card, the Applet or the conversation).
    func start(voice: VoiceInput, model: AppModel, say: @escaping (String) -> Void) {
        guard phase == .off else { return }
        quiet = false
        phase = .listening
        self.voice = voice
        loop = Task { [weak self] in await self?.run(voice: voice, model: model, say: say) }
    }

    func stop() {
        guard phase != .off else { return }
        phase = .off
        loop?.cancel()
        loop = nil
        if let voice { Task { await voice.cancel() } }
        voice = nil
        synthesizer.stopSpeaking(at: .immediate)
        finishSpeaking()
    }

    /// A tap on the microphone while Fox speaks: stop the voice and listen. False when Fox was not speaking.
    func interrupt() -> Bool {
        guard phase == .speaking else { return false }
        synthesizer.stopSpeaking(at: .immediate)
        finishSpeaking()
        return true
    }

    private func run(voice: VoiceInput, model: AppModel, say: (String) -> Void) async {
        var misses = 0
        var echo: String?
        while !Task.isCancelled && phase != .off {
            phase = .listening
            // After a barge-in the microphone is already listening (`start` leaves it be).
            await voice.start(lastLine: model.turns.last(where: { $0.role == .user })?.text)
            if case .unavailable = voice.state { stop(); return }
            var pause = TalkPause()
            while voice.listening && !Task.isCancelled {
                if pause.heard(voice.transcript, at: Date()) { break }
                try? await Task.sleep(for: .milliseconds(200))
            }
            let heard = await voice.stop()
            let text = echo.flatMap { TalkRules.interruption(heard, reply: $0) } ?? heard
            echo = nil
            guard !Task.isCancelled, phase != .off else { return }
            if text.isEmpty {
                // Recognition ended with nothing (a long silence): listen again, but not forever on a failing recognizer.
                misses += 1
                if misses >= 6 { stop(); return }
                try? await Task.sleep(for: .milliseconds(300))
                continue
            }
            misses = 0
            if TalkRules.quietRequest(text) { quiet = true }
            phase = .thinking
            let before = model.turns.last(where: { $0.role == .fox })?.id
            say(text)
            let reply = await self.reply(to: text, after: before, model: model)
            guard !Task.isCancelled, phase != .off else { return }
            if let reply, !quiet, await speak(reply, voice: voice, model: model) { echo = TalkRules.spokenText(reply) }
        }
    }

    /// Fox's finished answer to `said`: the streaming turn once done (`model.streaming`), else a new Fox line in the
    /// conversation; nil after two minutes.
    private func reply(to said: String, after id: String?, model: AppModel) async -> String? {
        let deadline = Date().addingTimeInterval(120)
        while Date() < deadline && !Task.isCancelled {
            if let live = model.streaming, live.done, live.user == said, !live.text.isEmpty { return live.text }
            if !model.foxWorking, let last = model.turns.last(where: { $0.role == .fox }), last.id != id { return last.text }
            try? await Task.sleep(for: .milliseconds(300))
        }
        return nil
    }

    /// Reads the reply; true when the person talked over it (the microphone then goes on as their next line).
    private func speak(_ text: String, voice: VoiceInput, model: AppModel) async -> Bool {
        let plain = TalkRules.spokenText(text)
        guard !plain.isEmpty else { return false }
        phase = .speaking
        bargedIn = false
        let session = AVAudioSession.sharedInstance()
        await voice.start(lastLine: model.turns.last(where: { $0.role == .user })?.text, echoCancelled: true)
        let overhearing = voice.listening
        if !overhearing {
            try? session.setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
            try? session.setActive(true)
        }
        let watch = overhearing ? Task { [weak self] in
            while let self, !Task.isCancelled, self.phase == .speaking {
                if TalkRules.interruption(voice.transcript, reply: plain) != nil {
                    self.bargedIn = true
                    _ = self.interrupt()
                    return
                }
                try? await Task.sleep(for: .milliseconds(200))
            }
        } : nil
        let utterance = AVSpeechUtterance(string: String(plain.prefix(4000)))
        // The reply's own language when its script names one (WorldletKit SpeechLanguage), else the phone's voice.
        if let language = SpeechLanguage.language(of: plain) {
            utterance.voice = AVSpeechSynthesisVoice.speechVoices().first { $0.language.hasPrefix(language) }
        }
        await withCheckedContinuation { continuation in
            spoken = continuation
            synthesizer.speak(utterance)
        }
        watch?.cancel()
        // Fox finished (or a tap interrupted it): the next line starts on a fresh microphone, without Fox's echo.
        if overhearing && !bargedIn { await voice.cancel() }
        if !overhearing { try? session.setActive(false, options: .notifyOthersOnDeactivation) }
        return bargedIn
    }

    private func finishSpeaking() {
        spoken?.resume()
        spoken = nil
    }
}

/// The synthesizer's delegate: says on the main actor when an utterance finished or was stopped.
private final class SpeechEnd: NSObject, AVSpeechSynthesizerDelegate {
    @MainActor var ended: () -> Void = {}

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.ended() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.ended() }
    }
}
