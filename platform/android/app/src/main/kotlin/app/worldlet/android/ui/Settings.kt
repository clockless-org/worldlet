package app.worldlet.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel

/** The computer this phone follows, unpairing, and the app version, in a bottom sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(model: AppModel, close: () -> Unit) {
    val context = LocalContext.current
    val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "1.0"
    ModalBottomSheet(close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.paper) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 16.dp).navigationBarsPadding().testTag("settingsSheet"),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Settings", color = Palette.paperInk, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            if (model.demo?.tried == true) {
                TextButton({ close(); model.unpair() }, modifier = Modifier.testTag("leaveDemo")) {
                    Text("Leave the demo", color = Palette.forest, fontWeight = FontWeight.SemiBold)
                }
                Text("This is sample data. Pair with Worldlet on your computer to see your own.", color = Palette.paperFoot, fontSize = 13.sp)
            } else {
                Line("Paired with", model.computerName.ifEmpty { "Your computer" })
                Line("Status", if (model.computerOnline) "Connected" else "Away")
                HorizontalDivider(color = Palette.paperFoot.copy(alpha = 0.2f))
                TextButton({ close(); model.unpair() }, modifier = Modifier.testTag("unpair")) {
                    Text("Unpair this phone", color = Color(0xFFB3261E), fontWeight = FontWeight.SemiBold)
                }
            }
            Text("Messages between this phone and your computer are end-to-end encrypted. Worldlet passes them along but cannot read them.",
                color = Palette.paperFoot, fontSize = 13.sp)
            HorizontalDivider(color = Palette.paperFoot.copy(alpha = 0.2f))
            Line("Version", version)
        }
    }
}

@Composable
private fun Line(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Palette.paperInk, fontSize = 16.sp)
        Text(value, color = Palette.paperFoot, fontSize = 16.sp)
    }
}
