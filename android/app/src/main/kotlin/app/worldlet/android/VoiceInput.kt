package app.worldlet.android

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.LocaleList
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.worldlet.kit.SpeechLanguage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Hold to talk to Fox. Speech is recognized on this phone only (Android's on-device recognizer, Android 12 and
 * later): no audio leaves the phone or is kept, and only the recognized text goes to the computer, as a typed line
 * would. A phone without on-device recognition says voice is off rather than sending audio to a server.
 */
class VoiceInput(private val context: Context) {
    sealed interface State {
        data object Idle : State
        data object Listening : State
        data class Unavailable(val reason: String) : State
    }

    var state by mutableStateOf<State>(State.Idle); private set
    /** The words heard so far in this hold. */
    var transcript by mutableStateOf(""); private set

    private var recognizer: SpeechRecognizer? = null
    private var finished: CompletableDeferred<String>? = null

    val listening get() = state == State.Listening
    /** The recognizer finished on its own (results or an error) while still marked listening; [stop] collects it. */
    val ended get() = finished?.isCompleted == true

    fun dismissProblem() {
        if (state is State.Unavailable) state = State.Idle
    }

    /**
     * Starts listening in the language of [lastLine] (the person's latest line to Fox), else the phone's own
     * ([SpeechLanguage]); the caller has already asked for the microphone permission.
     */
    fun start(permitted: Boolean, lastLine: String? = null) {
        if (listening) return
        if (!permitted) {
            state = State.Unavailable("Allow the microphone for Worldlet in Settings to talk to Fox. Speech is recognized on this phone only.")
            return
        }
        val onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        if (!onDevice) {
            state = State.Unavailable("This phone can't recognize speech on the device, and Worldlet never sends your voice anywhere. Type to Fox instead.")
            return
        }
        transcript = ""
        val done = CompletableDeferred<String>()
        finished = done
        val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        this.recognizer = recognizer
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, SpeechLanguage.tag(lastLine, LocaleList.getDefault().toLanguageTags().split(',')))
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            // Keep listening through pauses while the person holds.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 10_000L)
        }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(partial: Bundle?) {
                partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { transcript = it }
            }
            override fun onResults(results: Bundle?) {
                results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { transcript = it }
                done.complete(transcript)
            }
            override fun onError(error: Int) {
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    // The phone lacks this language's on-device model: fetch it (Android 13 and later) and say so.
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) runCatching { recognizer.triggerModelDownload(intent) }
                    state = State.Unavailable("This phone is getting speech recognition for your language. Try again in a minute, or type to Fox.")
                }
                done.complete(transcript)
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        recognizer.startListening(intent)
        state = State.Listening
    }

    /** Stops listening and returns what was heard. */
    suspend fun stop(): String {
        val recognizer = recognizer ?: return ""
        recognizer.stopListening()
        val text = withTimeoutOrNull(2_000) { finished?.await() } ?: transcript
        recognizer.destroy()
        this.recognizer = null
        finished = null
        if (listening) state = State.Idle
        return text.trim()
    }
}
