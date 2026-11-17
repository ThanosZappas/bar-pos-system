package gr.barlab.negroni.profile

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.core.graphics.scale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.min

/**
 * Turns a picture from the gallery into what the server accepts: the centre square, 256×256,
 * JPEG under [MAX_BYTES]. ImageDecoder also applies the photo's EXIF rotation.
 */
object PhotoShrinker {
    const val SIZE = 256
    /** The server's limit is 100 KB; stay a little under it. */
    const val MAX_BYTES = 95 * 1024

    suspend fun shrink(resolver: ContentResolver, uri: Uri): ByteArray = withContext(Dispatchers.Default) {
        val source = ImageDecoder.createSource(resolver, uri)
        val decoded = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            // Decode small already: a phone photo is 12+ megapixels.
            val sample = sampleSize(info.size.width, info.size.height, SIZE)
            decoder.setTargetSize(info.size.width / sample, info.size.height / sample)
        }
        val (x, y, side) = centerSquare(decoded.width, decoded.height)
        val square = Bitmap.createBitmap(decoded, x, y, side, side).scale(SIZE, SIZE)
        var quality = 88
        var bytes = jpeg(square, quality)
        while (bytes.size > MAX_BYTES && quality > 40) {
            quality -= 12
            bytes = jpeg(square, quality)
        }
        bytes
    }

    private fun jpeg(bitmap: Bitmap, quality: Int): ByteArray =
        ByteArrayOutputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out); out.toByteArray() }

    /** Left, top and side of the largest centred square in a [width]×[height] picture. */
    fun centerSquare(width: Int, height: Int): Triple<Int, Int, Int> {
        val side = min(width, height)
        return Triple((width - side) / 2, (height - side) / 2, side)
    }

    /** The largest power-of-two reduction that keeps the short side at least [target] pixels. */
    fun sampleSize(width: Int, height: Int, target: Int): Int {
        var sample = 1
        while (min(width, height) / (sample * 2) >= target) sample *= 2
        return sample
    }
}
