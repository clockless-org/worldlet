package app.worldlet.android.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.worldlet.android.AppModel
import app.worldlet.android.R
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** First run: scan the code from Worldlet on the computer (companion panel → Phone), or paste its pairing link. */
@Composable
fun PairScreen(model: AppModel) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().background(Palette.paper).safeDrawingPadding().padding(24.dp).testTag("pairScreen"),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        Spacer(Modifier.weight(1f))
        Image(painterResource(R.drawable.fox), null, Modifier.size(150.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Worldlet on your phone", color = Palette.paperInk, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("See what needs you and talk to Fox. Your computer does the work; this phone stays in step with it.",
                color = Palette.paperFoot, fontSize = 16.sp, textAlign = TextAlign.Center)
        }
        Column(
            Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.6f), RoundedCornerShape(14.dp)).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Step(1, "Open Worldlet on your computer.")
            Step(2, "Open Fox's panel and choose Mobile.")
            Step(3, "Press Pair phone and scan the code.")
        }
        Spacer(Modifier.weight(1f))
        model.error?.let { Text(it, color = Color(0xFFB3261E), fontSize = 13.sp, textAlign = TextAlign.Center) }
        Button(
            { scan(context, model) },
            colors = ButtonDefaults.buttonColors(containerColor = Palette.forest, contentColor = Palette.paper),
            modifier = Modifier.fillMaxWidth().height(52.dp).testTag("scan"),
        ) {
            Icon(Icons.Outlined.QrCodeScanner, null)
            Text("  Scan pairing code", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
        TextButton({
            val clip = (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
            val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
            if (text.isNullOrBlank()) model.error = "Copy the pairing link on your computer first." else model.pair(text)
        }, modifier = Modifier.testTag("paste")) { Text("Paste pairing link", color = Palette.forest) }
        TextButton(model::startDemo, modifier = Modifier.testTag("tryDemo")) { Text("No computer yet? Try the demo", color = Palette.forest) }
    }
}

@Composable
private fun Step(number: Int, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("$number", color = Palette.paper, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
            modifier = Modifier.background(Palette.leaf, CircleShape).size(22.dp).padding(top = 2.dp))
        Text("  $text", color = Palette.paperInk, fontSize = 15.sp)
    }
}

/** Google's code scanner reads the QR code without Worldlet holding the camera permission. */
private fun scan(context: Context, model: AppModel) {
    val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    GmsBarcodeScanning.getClient(context, options).startScan()
        .addOnSuccessListener { code -> code.rawValue?.let(model::pair) }
        .addOnFailureListener { model.error = "The scanner isn't available on this phone. Copy the pairing link on your computer and paste it here." }
}
