package app.worldlet.android

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import app.worldlet.android.ui.WorldletRoot
import app.worldlet.kit.PushTarget

class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                // Demo data only in a debuggable build: the activity is exported, so any app could start it with extras.
                val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
                val demo = if (debuggable && intent.getBooleanExtra("demo", false)) Demo.Options(intent.getStringExtra("page"), intent.getStringExtra("card"), intent.getBooleanExtra("live", false), intent.getStringExtra("applet"), order = intent.getBooleanExtra("order", false)) else null
                val name = Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL
                val version = packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
                val stores = demo == null
                val push: (suspend () -> String?)? = if (stores && Push.configured) ({ Push.token(applicationContext) }) else null
                return AppModel(if (stores) PairingStore(applicationContext) else null, name, version, demo, if (stores) WidgetStore(applicationContext) else null, push) as T
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) open(intent)
        // The long poll runs while the app is on screen; in the background the phone stops asking, and notifications
        // show instead (Push.kt).
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) { Push.foreground = true; model.resume() }
            override fun onStop(owner: LifecycleOwner) { Push.foreground = false; model.pause() }
        })
        setContent { WorldletRoot(model) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        open(intent)
    }

    /** Scanning the computer's code with the camera opens worldlet://pair?… here; a tapped notification opens its item's
     * card, Applet's page or Fox's dialogue. */
    private fun open(intent: Intent?) {
        PushTarget.read { intent?.getStringExtra(it) }?.let { model.show(it); return }
        val link = intent?.data?.toString() ?: return
        if (link.startsWith("worldlet://pair")) model.pair(link)
    }
}
