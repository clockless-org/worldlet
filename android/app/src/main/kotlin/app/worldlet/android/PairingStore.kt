package app.worldlet.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import app.worldlet.kit.Base64Url
import app.worldlet.kit.PairLink
import app.worldlet.kit.WorldletJson
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The pairing link (with its secret) is sealed with a key that never leaves this phone's Android Keystore, and the
 * app's preferences are left out of backups and device transfers: a new phone pairs again, as on the iPhone. */
class PairingStore(context: Context) {
    private val prefs = context.getSharedPreferences("pairing", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build())
        return generator.generateKey()
    }

    fun load(): PairLink? = runCatching {
        val sealed = Base64Url.decode(prefs.getString(LINK, null) ?: return null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, 12))
        WorldletJson.decodeFromString(PairLink.serializer(), String(cipher.doFinal(sealed, 12, sealed.size - 12)))
    }.getOrNull()

    fun save(link: PairLink) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(WorldletJson.encodeToString(PairLink.serializer(), link).toByteArray())
        prefs.edit().putString(LINK, Base64Url.encode(sealed)).apply()
    }

    fun delete() {
        prefs.edit().remove(LINK).apply()
    }

    private companion object {
        const val ALIAS = "worldlet.pairing"
        const val LINK = "computer"
    }
}
