package app.worldlet.android

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.worldlet.kit.SpeechLanguage
import app.worldlet.kit.TalkPause
import app.worldlet.kit.TalkRules
import app.worldlet.kit.Turn
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale

/**
 * Talk with Fox (owner parity plan item 7), held from Fox's button in the dock: listen on this phone, send each
 * utterance as a line ([TalkPause] decides when the person stopped), read Fox's finished reply with the system voice
 * ([TextToSpeech]), then listen again. While Fox speaks the phone is in communication mode, so its echo cancellation
 * covers the voice (played as voice communication) and the recognizer stays open; words of the person's own
 * ([TalkRules.interruption]) stop the voice and become the next line, and a tap on the microphone interrupts too. A short
 * "be quiet" ([TalkRules.quietRequest]) keeps Talk without the voice. Speech stays on the phone as in hold-to-talk
 * ([VoiceInput]); only the words go to the computer.
 */
class TalkMode(context: Context, private val scope: CoroutineScope) {
    enum class Phase { Off, Listening, Thinking, Speaking }

    var phase by mutableStateOf(Phase.Off); private set
    /** The person asked for quiet: replies are shown, not read, until Talk ends. */
    var quiet by mutableStateOf(false); private set
    val on get() = phase != Phase.Off

    private val context = context.applicationContext
    private var tts: TextToSpeech? = null
    private var ttsReady: CompletableDeferred<Boolean>? = null
    private var spoken: CompletableDeferred<Unit>? = null
    private var loop: Job? = null
    private var voice: VoiceInput? = null
    /** The person talked over Fox's last reply; its words are what the open microphone heard after Fox's own. */
    private var bargedIn = false

    /** Starts Talk. [listen] starts the microphone (false when it is not allowed yet or voice is off); [say] sends a
     * line where a typed one would go now. */
    fun start(voice: VoiceInput, model: AppModel, listen: () -> Boolean, say: (String) -> Unit) {
        if (on) return
        quiet = false
        phase = Phase.Listening
        this.voice = voice
        loop = scope.launch { run(voice, model, listen, say) }
    }

    fun stop() {
        if (!on) return
        phase = Phase.Off
        loop?.cancel()
        loop = null
        tts?.stop()
        spoken?.complete(Unit)
        voice?.let { scope.launch { it.stop() } }
        voice = null
    }

    /** A tap on the microphone while Fox speaks: stop the voice and listen. False when Fox was not speaking. */
    fun interrupt(): Boolean {
        if (phase != Phase.Speaking) return false
        tts?.stop()
        spoken?.complete(Unit)
        return true
    }

    fun shutdown() {
        stop()
        tts?.shutdown()
        tts = null
        ttsReady = null
    }

    private suspend fun run(voice: VoiceInput, model: AppModel, listen: () -> Boolean, say: (String) -> Unit) {
        var misses = 0
        var echo: String? = null
        while (scope.isActive && on) {
            phase = Phase.Listening
            // After a barge-in the recognizer is already listening ([VoiceInput.start] leaves it be).
            if (!listen()) { stop(); return }
            val pause = TalkPause()
            while (on && voice.listening && !voice.ended) {
                if (pause.heard(voice.transcript, System.currentTimeMillis())) break
                delay(200)
            }
            val heard = voice.stop()
            val text = echo?.let { TalkRules.interruption(heard, it) } ?: heard
            echo = null
            if (!on) return
            if (text.isEmpty()) {
                // Recognition ended with nothing (a long silence): listen again, but not forever on a failing recognizer.
                if (++misses >= 6) { stop(); return }
                delay(300)
                continue
            }
            misses = 0
            if (TalkRules.quietRequest(text)) quiet = true
            phase = Phase.Thinking
            val before = model.turns.lastOrNull { it.role == Turn.Role.Fox }?.id
            say(text)
            val reply = reply(text, before, model)
            if (!on) return
            if (reply != null && !quiet && speak(reply, voice, listen)) echo = TalkRules.spokenText(reply)
        }
    }

    /** Fox's finished answer to [said]: the streaming turn once done, else a new Fox line; null after two minutes. */
    private suspend fun reply(said: String, before: String?, model: AppModel): String? = withTimeoutOrNull(120_000) {
        var found: String? = null
        while (found == null && on) {
            val live = model.streaming
            val last = model.turns.lastOrNull { it.role == Turn.Role.Fox }
            found = when {
                live != null && live.done && live.user == said && live.text.isNotEmpty() -> live.text
                !model.foxWorking && last != null && last.id != before -> last.text
                else -> null
            }
            if (found == null) delay(300)
        }
        found
    }

    /** Reads the reply; true when the person talked over it (the recognizer then goes on as their next line). */
    private suspend fun speak(text: String, input: VoiceInput, listen: () -> Boolean): Boolean {
        val plain = TalkRules.spokenText(text)
        if (plain.isEmpty()) return false
        val voice = ready() ?: return false
        if (!on) return false
        phase = Phase.Speaking
        bargedIn = false
        val audio = context.getSystemService(AudioManager::class.java)
        audio?.mode = AudioManager.MODE_IN_COMMUNICATION
        voice.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        val overhearing = listen()
        val watch = if (overhearing) scope.launch {
            while (on && phase == Phase.Speaking) {
                if (TalkRules.interruption(input.transcript, plain) != null) { bargedIn = true; interrupt(); break }
                delay(200)
            }
        } else null
        val done = CompletableDeferred<Unit>()
        spoken = done
        // The reply's own language when its script names one (kit SpeechLanguage), else the phone's.
        voice.setLanguage(SpeechLanguage.languageOf(plain)?.let(Locale::forLanguageTag) ?: Locale.getDefault())
        voice.speak(plain.take(TextToSpeech.getMaxSpeechInputLength() - 1), TextToSpeech.QUEUE_FLUSH, null, "talk-${System.nanoTime()}")
        withTimeoutOrNull(180_000) { done.await() }
        spoken = null
        watch?.cancel()
        // Fox finished (or a tap interrupted it): the next line starts on a fresh recognizer, without Fox's echo.
        if (overhearing && !bargedIn) input.stop()
        audio?.mode = AudioManager.MODE_NORMAL
        voice.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        return bargedIn
    }

    /** The system voice, started once; null when the phone has none. */
    private suspend fun ready(): TextToSpeech? {
        val waiting = ttsReady ?: CompletableDeferred<Boolean>().also { started ->
            ttsReady = started
            tts = TextToSpeech(context) { status -> started.complete(status == TextToSpeech.SUCCESS) }.apply {
                setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) { spoken?.complete(Unit) }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) { spoken?.complete(Unit) }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) { spoken?.complete(Unit) }
                })
            }
        }
        return if (withTimeoutOrNull(5_000) { waiting.await() } == true) tts else null
    }
}
