package app.worldlet.android

import android.annotation.SuppressLint
import android.app.Application
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import app.worldlet.android.ui.Palette
import app.worldlet.kit.PairKeys
import app.worldlet.kit.PhonePush
import app.worldlet.kit.PhoneSession
import app.worldlet.kit.PushAction
import app.worldlet.kit.WorldletJson
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Notifications from the computer while the app is closed (README.md, Notifications): the relay hands Firebase Messaging
 * a data message `{p: pairing id, b: box}` and this phone opens the box with its pairing key and posts the notification
 * itself, so neither the relay nor Google sees what it says. Firebase is set up from the build's FCM_* values, never a
 * google-services.json; a build without them has no push and runs as before.
 */
object Push {
    const val CHANNEL = "worldlet"

    /** The app is on screen (MainActivity started): the live Center and dialogue already show what a notification
     * would say, so none is posted. */
    @Volatile
    var foreground = false

    val configured: Boolean
        get() = listOf(BuildConfig.FCM_PROJECT_ID, BuildConfig.FCM_APP_ID, BuildConfig.FCM_API_KEY, BuildConfig.FCM_SENDER_ID).all { it.isNotEmpty() }

    /** Sets Firebase up from the build's values; nothing without them. Firebase's own start-up provider is removed in the
     * manifest and its auto-init is off, so no token exists until [token] asks for one after pairing. */
    fun setup(context: Context) {
        if (!configured || FirebaseApp.getApps(context).isNotEmpty()) return
        val options = FirebaseOptions.Builder().setProjectId(BuildConfig.FCM_PROJECT_ID).setApplicationId(BuildConfig.FCM_APP_ID)
            .setApiKey(BuildConfig.FCM_API_KEY).setGcmSenderId(BuildConfig.FCM_SENDER_ID).build()
        runCatching { FirebaseApp.initializeApp(context, options) }
    }

    /** This build has push and the person allows notifications (on Android 13 and later, after the one ask). */
    fun allowed(context: Context) = configured && FirebaseApp.getApps(context).isNotEmpty() && NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** This phone's Firebase token while notifications are allowed; null otherwise or when Firebase cannot make one. */
    suspend fun token(context: Context): String? {
        if (!allowed(context)) return null
        val messaging = runCatching { FirebaseMessaging.getInstance().apply { isAutoInitEnabled = true } }.getOrNull() ?: return null
        return withTimeoutOrNull(30_000) {
            suspendCancellableCoroutine { done -> messaging.token.addOnCompleteListener { task -> done.resume(if (task.isSuccessful) task.result else null) } }
        }
    }

    const val EXTRA_PUSH = "push.json"
    const val EXTRA_ACTION = "push.action"
    const val EXTRA_PAIR = "push.pair"
    const val REPLY = "push.reply"

    /** Posts [push] on the "worldlet" channel; a tap opens the app on its target (MainActivity reads the extras), and its
     * buttons ([PhonePush.actions]) answer from the shade through [PushActionReceiver] without opening it. [note] says
     * why it is posted again (a button's message did not go out). */
    @SuppressLint("MissingPermission") // areNotificationsEnabled() is false without POST_NOTIFICATIONS on Android 13+.
    fun notify(context: Context, push: PhonePush, pair: String, note: String? = null) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        manager.createNotificationChannel(NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
            .setName("Worldlet").setDescription("What your computer has for you while this app is closed").build())
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        push.target?.extras?.forEach { (key, value) -> intent.putExtra(key, value) }
        val tap = PendingIntent.getActivity(context, push.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setColor(Palette.lantern.toArgb())
            .setContentTitle(push.title).setContentText(push.body).setStyle(NotificationCompat.BigTextStyle().bigText(push.body))
            .apply { if (push.at > 0) setWhen(push.at.toLong()).setShowWhen(true) }
            .setContentIntent(tap).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply { note?.let { setSubText(it).setOnlyAlertOnce(true) } }
            .apply { push.actions.forEach { addAction(button(context, push, pair, it)) } }
            .build()
        runCatching { manager.notify(push.id, 0, notification) }
    }

    /** One button: an explicit broadcast to this app's own receiver with the opened push, so the action needs neither the
     * box again nor the app on screen. Reply takes inline text (RemoteInput, so its intent is mutable); Reply and Allow
     * once ask to unlock the phone first, so nobody answers the person's Agent from a locked screen. */
    private fun button(context: Context, push: PhonePush, pair: String, action: PushAction): NotificationCompat.Action {
        val intent = Intent(context, PushActionReceiver::class.java).setAction("app.worldlet.android.push.${action.wire}")
            .putExtra(EXTRA_PUSH, WorldletJson.encodeToString(PhonePush.serializer(), push)).putExtra(EXTRA_ACTION, action.wire).putExtra(EXTRA_PAIR, pair)
        val reply = action == PushAction.Reply
        val mutable = if (reply && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else if (reply) 0 else PendingIntent.FLAG_IMMUTABLE
        val pending = PendingIntent.getBroadcast(context, (push.id + action.wire).hashCode(), intent, mutable or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action.Builder(0, action.label, pending)
            .apply { if (reply) addRemoteInput(RemoteInput.Builder(REPLY).setLabel("Reply to ${push.title}").build()).setAllowGeneratedReplies(false) }
            .setSemanticAction(when (action) {
                PushAction.Reply -> NotificationCompat.Action.SEMANTIC_ACTION_REPLY
                PushAction.Done -> NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ
                PushAction.Deny -> NotificationCompat.Action.SEMANTIC_ACTION_DELETE
                else -> NotificationCompat.Action.SEMANTIC_ACTION_NONE
            })
            .setShowsUserInterface(false).setAuthenticationRequired(reply || action == PushAction.Allow)
            .build()
    }
}

/** A notification's button (core/phone/README.md, Push › Actions): sends the same sealed message as the app's own button
 * (PhonePush.message) to the computer through the relay, without bringing the app up. The notification goes once the
 * message is out; when it could not go, it comes back with its buttons and says so. A push from an earlier pairing does
 * nothing. */
class PushActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val push = runCatching { WorldletJson.decodeFromString(PhonePush.serializer(), intent.getStringExtra(Push.EXTRA_PUSH)!!) }.getOrNull() ?: return
        val action = PushAction.of(intent.getStringExtra(Push.EXTRA_ACTION))
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(Push.REPLY)?.toString()
        val link = PairingStore(app).load()?.takeIf { PairKeys(it.secret).id == intent.getStringExtra(Push.EXTRA_PAIR) }
        val message = action?.let { push.message(it, text) }
        val manager = NotificationManagerCompat.from(app)
        if (link == null || message == null) {
            // Nothing to say (an empty reply) keeps the notification as it was; another pairing's goes.
            if (link != null && action == PushAction.Reply) Push.notify(app, push, PairKeys(link.secret).id) else manager.cancel(push.id, 0)
            return
        }
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val sent = runCatching { withTimeout(20_000) { PhoneSession(link).send(message) } }.isSuccess
                if (sent) manager.cancel(push.id, 0) else Push.notify(app, push, PairKeys(link.secret).id, "Not sent. Check your connection and try again.")
            } finally { pending.finish() }
        }
    }
}

/** Sets Firebase up before anything else runs, including [PushService] when a message wakes the app. */
class WorldletApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Push.setup(this)
    }
}

/** Firebase Messaging's entry point: a new token goes to the relay while paired, and a message for this pairing becomes a
 * notification unless the app is on screen. */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val link = PairingStore(applicationContext).load() ?: return
        if (!Push.allowed(applicationContext)) return
        runBlocking { runCatching { withTimeoutOrNull(20_000) { PhoneSession(link).registerPush("fcm", token) } } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (Push.foreground) return
        val link = PairingStore(applicationContext).load() ?: return
        val keys = PairKeys(link.secret)
        val push = keys.openPush(message.data) ?: return
        Push.notify(applicationContext, push, keys.id)
    }
}
