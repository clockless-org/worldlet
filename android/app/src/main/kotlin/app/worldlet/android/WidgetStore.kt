package app.worldlet.android

import android.content.Context
import android.util.AtomicFile
import app.worldlet.kit.WidgetsSnapshot
import app.worldlet.kit.WorldletJson
import java.io.File

/** The widgets as this phone last had them, each with its page and the phone's own merged state, kept in the app's
 * private files (left out of cloud backups and device transfers like the pairing, res/xml) so they open after a relaunch while the computer sleeps
 * (core/artifacts/README.md, Phone). Pages are up to about 120 KB each. */
class WidgetStore(context: Context) {
    private val file = AtomicFile(File(context.filesDir, "widgets.json"))

    fun load(): WidgetsSnapshot? = runCatching {
        WorldletJson.decodeFromString(WidgetsSnapshot.serializer(), String(file.readFully(), Charsets.UTF_8))
    }.getOrNull()

    /** Writes the whole snapshot at once; a write cut short leaves the previous one. */
    fun save(snapshot: WidgetsSnapshot) {
        val stream = file.startWrite()
        try {
            stream.write(WorldletJson.encodeToString(WidgetsSnapshot.serializer(), snapshot).toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (e: Exception) {
            file.failWrite(stream)
        }
    }

    fun delete() {
        file.delete()
    }
}
