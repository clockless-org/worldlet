package app.worldlet.android.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.core.content.ContextCompat
import app.worldlet.android.AppModel

/** Android 13 and later ask before an app shows notifications: once, after pairing, with one line on what they are for
 * (README.md, Notifications). Either answer is kept, and the relay gets the token only if the person allows them. */
@Composable
fun NotificationAsk(model: AppModel) {
    if (Build.VERSION.SDK_INT < 33 || !model.notifies || model.phase != AppModel.Phase.Paired) return
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("push", Context.MODE_PRIVATE) }
    var asking by remember {
        mutableStateOf(!prefs.getBoolean(ASKED, false) && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { model.syncPush() }
    if (!asking) return
    fun answer(allow: Boolean) {
        asking = false
        prefs.edit().putBoolean(ASKED, true).apply()
        if (allow) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    val computer = model.computerName.ifEmpty { "your computer" }
    AlertDialog(
        onDismissRequest = { answer(false) },
        confirmButton = { TextButton({ answer(true) }, Modifier.testTag("allowNotifications")) { Text("Continue") } },
        dismissButton = { TextButton({ answer(false) }, Modifier.testTag("skipNotifications")) { Text("Not now") } },
        title = { Text("Notifications from $computer?") },
        text = { Text("While this app is closed, $computer can tell you when something new needs you, a routine finishes or Fox answers. They are end-to-end encrypted, like everything else here.") },
    )
}

private const val ASKED = "asked"
