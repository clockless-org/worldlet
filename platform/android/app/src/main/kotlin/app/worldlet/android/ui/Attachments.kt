package app.worldlet.android.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import app.worldlet.kit.PhoneAttachment
import java.io.ByteArrayOutputStream

/**
 * Reads a photo or file the person picked for Fox into an attachment, or says why it can't go: photos are made
 * smaller (at most 1600 pixels on a side, JPEG) so they pass through the pairing relay quickly; other files must be
 * at most [PhoneAttachment.MAX_BYTES].
 */
internal fun readAttachment(context: Context, uri: Uri, photo: Boolean): Result<PhoneAttachment> = runCatching {
    val resolver = context.contentResolver
    val named = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: uri.lastPathSegment ?: "File"
    val mime = resolver.getType(uri) ?: "application/octet-stream"
    if (photo || mime.startsWith("image/") && mime != "image/gif" && mime != "image/svg+xml") {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth > 0) {
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= PHOTO_SIDE) sample *= 2
            val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            if (decoded != null) {
                val scale = minOf(1f, PHOTO_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
                val bitmap = if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true) else decoded
                val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 70, it) }.toByteArray()
                return@runCatching PhoneAttachment(named.substringBeforeLast('.') + ".jpg", "image/jpeg", bytes)
            }
        }
    }
    val bytes = resolver.openInputStream(uri)?.use { input ->
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
            if (out.size() > PhoneAttachment.MAX_BYTES) throw AttachmentProblem("$named is larger than 1.5 MB, too large to send to your computer from the phone.")
        }
        out.toByteArray()
    } ?: throw AttachmentProblem("Worldlet couldn't open $named.")
    PhoneAttachment(named, mime, bytes)
}

internal class AttachmentProblem(message: String) : Exception(message)

private const val PHOTO_SIDE = 1600
