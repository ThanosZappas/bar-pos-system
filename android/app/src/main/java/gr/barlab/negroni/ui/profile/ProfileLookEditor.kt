package gr.barlab.negroni.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.profile.PhotoShrinker
import gr.barlab.negroni.profile.ProfileRepository
import gr.barlab.negroni.ui.auth.authFailureMessage
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Pick an icon or upload a picture for [uid] (null: yourself). "Upload picture" opens Android's
 * photo picker, which needs no permission; then [PhotoCropDialog] places the picture in the square
 * frame (move, zoom, rotate) and the result is shrunk on the phone before it is sent.
 */
@Composable
fun ProfileLookEditor(uid: String?, role: Role, icon: String?, photo: ImageBitmap?, profiles: ProfileRepository, modifier: Modifier = Modifier) {
    val resolver = LocalContext.current.contentResolver
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<AuthFailure?>(null) }
    var unreadable by remember { mutableStateOf(false) }
    var cropping by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    val current = iconOf(icon, role)

    fun run(block: suspend () -> Result<Unit>) {
        busy = true
        error = null
        unreadable = false
        scope.launch {
            block().onFailure { error = it as? AuthFailure ?: AuthFailure(AuthFailure.Reason.Unknown, it.message) }
            busy = false
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        error = null
        unreadable = false
        scope.launch {
            runCatching { PhotoShrinker.load(resolver, uri) }
                .onSuccess { cropping = it } // the editor below decides the frame
                .onFailure { unreadable = true }
            busy = false
        }
    }

    cropping?.let { source ->
        PhotoCropDialog(
            source = source,
            onCancel = { cropping = null },
            onDone = { framed ->
                cropping = null
                run { profiles.uploadPhoto(uid, PhotoShrinker.encode(framed)) }
            },
        )
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
            ProfileIconSet.ids.forEach { id ->
                ProfileAvatar(
                    id,
                    null,
                    52.dp,
                    Modifier.clickable(enabled = !busy, role = SemanticsRole.Button) { run { profiles.setIcon(uid, id) } }.semantics { contentDescription = id },
                    highlighted = photo == null && id == current,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            OutlinedButton(enabled = !busy, onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Text(stringResource(R.string.upload_picture).caps(), style = MaterialTheme.typography.labelLarge)
            }
            if (photo != null) TextButton(enabled = !busy, onClick = { run { profiles.removePhoto(uid) } }) { Text(stringResource(R.string.remove_picture)) }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        error?.let { Text(authFailureMessage(it), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium) }
        if (unreadable) Text(stringResource(R.string.photo_failed), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium)
    }
}
