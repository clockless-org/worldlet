package app.worldlet.android.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.worldlet.android.AppModel

@Composable
fun WorldletRoot(model: AppModel) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Palette.lantern, onPrimary = Palette.forest, surface = Palette.world, background = Palette.world)) {
        when (model.phase) {
            AppModel.Phase.Unpaired -> PairScreen(model)
            AppModel.Phase.Connecting, AppModel.Phase.Paired -> HomeScreen(model)
        }
        // A pairing link for another computer (scanned, pasted or opened from anywhere) replaces this one only when the
        // person says so.
        model.replacement?.let { link ->
            val current = model.computerName.ifEmpty { "your computer" }
            val next = link.name.ifEmpty { "the other computer" }
            AlertDialog(
                onDismissRequest = model::keepPairing,
                confirmButton = { TextButton({ model.replacePairing(link) }, Modifier.testTag("replacePairing")) { Text("Pair with $next") } },
                dismissButton = { TextButton(model::keepPairing, Modifier.testTag("keepPairing")) { Text("Keep $current") } },
                title = { Text("Pair with another computer?") },
                text = { Text("Pair with $next instead of $current? This phone unpairs from $current and clears what it brought, Applets included.") },
            )
        }
    }
}
