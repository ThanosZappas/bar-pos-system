package gr.barlab.negroni.profile

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.snapshots
import com.google.firebase.functions.FirebaseFunctions
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.data.keepAlive
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.util.Base64

/**
 * Profile icons and pictures (server side: worker/src/avatars.ts). Each person changes their
 * own (uid = null); the admin anyone's. Pictures are read from avatars/{uid}, which staff can read.
 */
class ProfileRepository(private val db: FirebaseFirestore, private val functions: FirebaseFunctions) {

    /** Every uploaded picture, by uid. Small (256×256, at most 100 KB each) and few. */
    val photos: Flow<Map<String, ImageBitmap>> = db.collection("avatars").snapshots().map { snap ->
        snap.documents.mapNotNull { d ->
            val bytes = d.getBlob("photo")?.toBytes() ?: return@mapNotNull null
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { d.id to it.asImageBitmap() }
        }.toMap()
    }.flowOn(Dispatchers.Default).keepAlive()

    suspend fun setIcon(uid: String?, icon: String): Result<Unit> = call(mapOf("icon" to icon), uid)

    /** [jpeg]: already cropped and shrunk by [PhotoShrinker]. */
    suspend fun uploadPhoto(uid: String?, jpeg: ByteArray): Result<Unit> = call(mapOf("photo" to Base64.getEncoder().encodeToString(jpeg)), uid)

    suspend fun removePhoto(uid: String?): Result<Unit> = call(mapOf("photo" to null), uid)

    private suspend fun call(data: Map<String, Any?>, uid: String?): Result<Unit> = runCatching {
        functions.getHttpsCallable("setIcon").call(if (uid == null) data else data + ("uid" to uid)).await()
        Unit
    }.recoverCatching { throw AuthFailure.from(it) }
}
