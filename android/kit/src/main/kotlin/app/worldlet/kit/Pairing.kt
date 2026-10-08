package app.worldlet.kit

import java.net.URI
import java.net.URLDecoder
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable

// Phone pairing protocol v1, the Android half of core/phone/pairing.ts (see core/phone/README.md), the same as the
// iPhone's Pairing.swift. The QR code carries a 32-byte secret; HKDF-SHA256 turns it into the relay pairing id, one
// bearer token per side and the AES-256-GCM key that seals every payload. scripts/phone-pairing-check.ts,
// PairingTests.swift and PairingTest.kt pin the same test vector.

class PairingException(val reason: Reason) : Exception(reason.message) {
    enum class Reason(val message: String) {
        NotWorldlet("This is not a Worldlet pairing code."),
        NeedsUpdate("Update Worldlet to pair with this computer."),
        Incomplete("This pairing code is incomplete."),
        UnknownRelay("This pairing code names an unknown relay."),
    }
}

object Base64Url {
    fun encode(data: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(data)

    fun decode(text: String): ByteArray? {
        if (!text.all { it.isLetterOrDigit() && it.code < 128 || it == '-' || it == '_' }) return null
        return runCatching { Base64.getUrlDecoder().decode(text) }.getOrNull()
    }
}

/** `worldlet://pair?v=1&s=<secret>&n=<computer name>[&r=<relay origin>]` */
@Serializable
data class PairLink(
    @Serializable(with = SecretSerializer::class) val secret: ByteArray,
    val relay: String = DEFAULT_RELAY,
    val name: String,
) {
    override fun equals(other: Any?) =
        other is PairLink && secret.contentEquals(other.secret) && relay == other.relay && name == other.name

    override fun hashCode() = 31 * (31 * secret.contentHashCode() + relay.hashCode()) + name.hashCode()

    companion object {
        const val PROTOCOL_VERSION = "1"
        const val DEFAULT_RELAY = "https://worldlet.ai"

        fun parse(text: String): PairLink {
            val trimmed = text.trim()
            val uri = runCatching { URI(trimmed) }.getOrNull()
            if (uri == null || uri.scheme != "worldlet" || uri.host != "pair") throw PairingException(PairingException.Reason.NotWorldlet)
            // The desktop writes the query with URLSearchParams, which encodes a space as "+".
            val query = (uri.rawQuery ?: "").split('&').filter { it.isNotEmpty() }.associate { pair ->
                val key = pair.substringBefore('=')
                val value = if ('=' in pair) pair.substringAfter('=') else ""
                key to runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault("")
            }
            if (query["v"] != PROTOCOL_VERSION) throw PairingException(PairingException.Reason.NeedsUpdate)
            val secret = Base64Url.decode(query["s"] ?: "")
            if (secret == null || secret.size != 32) throw PairingException(PairingException.Reason.Incomplete)
            var relay = DEFAULT_RELAY
            val r = query["r"]
            if (!r.isNullOrEmpty()) {
                val url = runCatching { URI(r) }.getOrNull()
                val host = url?.host
                val ok = url != null && host != null &&
                    (url.scheme == "https" || (url.scheme == "http" && host in setOf("localhost", "127.0.0.1"))) &&
                    url.rawPath.isNullOrEmpty() && url.rawQuery == null
                if (!ok) throw PairingException(PairingException.Reason.UnknownRelay)
                relay = r
            }
            return PairLink(secret, relay, (query["n"] ?: "").take(64))
        }
    }
}

/** The secret in the stored link, as base64url. */
object SecretSerializer : KSerializer<ByteArray> {
    override val descriptor = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor("Secret", kotlinx.serialization.descriptors.PrimitiveKind.STRING)
    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ByteArray) = encoder.encodeString(Base64Url.encode(value))
    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder) = Base64Url.decode(decoder.decodeString()) ?: ByteArray(0)
}

class PairKeys(secret: ByteArray) {
    val id: String
    val desktopToken: String
    val phoneToken: String
    private val key: SecretKeySpec

    init {
        id = Base64Url.encode(hkdf(secret, "id", 16))
        desktopToken = Base64Url.encode(hkdf(secret, "desktop", 32))
        phoneToken = Base64Url.encode(hkdf(secret, "phone", 32))
        key = SecretKeySpec(hkdf(secret, "key", 32), "AES")
    }

    private fun aad(place: String) = "$id|$place".toByteArray()

    /** base64url(12-byte nonce | ciphertext | 16-byte tag), the same layout as WebCrypto's AES-GCM on the desktop. */
    fun sealText(plain: String, place: String): String {
        val nonce = ByteArray(12).also { random.nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad(place))
        return Base64Url.encode(nonce + cipher.doFinal(plain.toByteArray()))
    }

    /** Opens a box sealed for this pairing and place; throws when the key, pairing or place differ. */
    fun openText(box: String, place: String): String {
        val data = Base64Url.decode(box) ?: throw PairingException(PairingException.Reason.Incomplete)
        if (data.size < 12 + 16) throw PairingException(PairingException.Reason.Incomplete)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, data, 0, 12))
        cipher.updateAAD(aad(place))
        return String(cipher.doFinal(data, 12, data.size - 12))
    }

    /** A notification's data from Firebase Messaging (`p`, `b`): null unless it is for this pairing and opens. */
    fun openPush(data: Map<String, String>): PhonePush? {
        val box = data["b"] ?: return null
        if (data["p"] != id) return null
        return runCatching { open(PhonePush.serializer(), box, PUSH).clamped() }.getOrNull()?.takeIf { it.title.isNotEmpty() }
    }

    fun <T> seal(serializer: KSerializer<T>, value: T, place: String) = sealText(WorldletJson.encodeToString(serializer, value), place)
    fun <T> open(serializer: KSerializer<T>, box: String, place: String): T = WorldletJson.decodeFromString(serializer, openText(box, place))

    companion object {
        private val SALT = "worldlet-pair-v1".toByteArray()
        private val random = SecureRandom()

        /** "slot:attention", "to:desktop": the additional data binds a box to its pairing and place. */
        fun slot(name: String) = "slot:$name"
        fun to(role: String) = "to:$role"
        /** The place of a notification's box (core/phone, POST /notify): the additional data is `<id>|push`. */
        const val PUSH = "push"

        /** RFC 5869 HKDF-SHA256 with the protocol's salt. */
        fun hkdf(secret: ByteArray, info: String, length: Int): ByteArray {
            val extract = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(SALT, "HmacSHA256")) }
            val prk = extract.doFinal(secret)
            val expand = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(prk, "HmacSHA256")) }
            var out = ByteArray(0)
            var block = ByteArray(0)
            var counter = 1
            while (out.size < length) {
                expand.update(block)
                expand.update(info.toByteArray())
                expand.update(counter.toByte())
                block = expand.doFinal()
                out += block
                counter++
            }
            return out.copyOf(length)
        }
    }
}
