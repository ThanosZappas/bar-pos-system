package gr.barlab.negroni.profile

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Pictures for profiles: load from the gallery, place in a square frame (move, zoom, rotate, see
 * [PhotoFrame]), and render that frame as a 256×256 JPEG under [MAX_BYTES], which the server
 * accepts. ImageDecoder also applies the photo's EXIF rotation.
 */
object PhotoShrinker {
    const val SIZE = 256
    /** The server's limit is 100 KB; stay a little under it. */
    const val MAX_BYTES = 95 * 1024
    /** Enough detail to zoom in a few times before cropping to 256 px. */
    private const val EDIT_SIDE = 1600

    suspend fun load(resolver: ContentResolver, uri: Uri): Bitmap = withContext(Dispatchers.Default) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val sample = sampleSize(info.size.width, info.size.height, EDIT_SIDE)
            decoder.setTargetSize(info.size.width / sample, info.size.height / sample)
        }
    }

    /** What the square frame shows, as a [SIZE]×[SIZE] picture. */
    fun render(source: Bitmap, frame: PhotoFrame, viewSide: Float): Bitmap {
        val out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        val matrix = frame.matrix(source.width, source.height, viewSide).apply { postScale(SIZE / viewSide, SIZE / viewSide) }
        Canvas(out).apply {
            drawColor(0xFF111008.toInt()) // the app's background where the picture does not reach
            drawBitmap(source, matrix, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        }
        return out
    }

    suspend fun encode(bitmap: Bitmap): ByteArray = withContext(Dispatchers.Default) {
        var quality = 88
        var bytes = jpeg(bitmap, quality)
        while (bytes.size > MAX_BYTES && quality > 40) {
            quality -= 12
            bytes = jpeg(bitmap, quality)
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

/**
 * Where the picture sits in the square frame: [zoom] (1 = the picture just covers the frame),
 * [offsetX]/[offsetY] in frame pixels, [rotation] in degrees. The same transform draws the editor
 * and renders the result, so what you see is what is saved.
 */
data class PhotoFrame(val zoom: Float = 1f, val offsetX: Float = 0f, val offsetY: Float = 0f, val rotation: Float = 0f) {
    fun matrix(width: Int, height: Int, viewSide: Float): Matrix = Matrix().apply {
        val cover = max(viewSide / width, viewSide / height)
        postTranslate(-width / 2f, -height / 2f)
        postScale(cover * zoom, cover * zoom)
        postRotate(rotation)
        postTranslate(viewSide / 2f + offsetX, viewSide / 2f + offsetY)
    }

    companion object {
        const val MIN_ZOOM = 1f
        const val MAX_ZOOM = 6f
    }
}
