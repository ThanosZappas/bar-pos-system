package gr.barlab.negroni.ui.profile

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import gr.barlab.negroni.R
import gr.barlab.negroni.profile.PhotoFrame
import gr.barlab.negroni.profile.PhotoShrinker
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlin.math.roundToInt

/**
 * Place a picture in the profile's square frame before it is saved, like a profile-picture
 * editor: drag to move, pinch (or the slider) to zoom, twist with two fingers or tap Rotate.
 * [onDone] gets the 256×256 result.
 */
@Composable
fun PhotoCropDialog(source: Bitmap, onCancel: () -> Unit, onDone: (Bitmap) -> Unit) {
    var frame by remember(source) { mutableStateOf(PhotoFrame()) }
    var viewSide by remember { mutableFloatStateOf(0f) }
    val paint = remember { Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG) }

    Dialog(onDismissRequest = onCancel, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.fillMaxSize().background(BarLabColors.Bg).padding(Spacing.l),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            Text(stringResource(R.string.crop_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.crop_hint), style = MaterialTheme.typography.bodySmall, color = BarLabColors.Muted, textAlign = TextAlign.Center)
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f)
                    .clipToBounds()
                    .border(1.5.dp, BarLabColors.Gold)
                    .onSizeChanged { viewSide = it.width.toFloat() }
                    .pointerInput(source) {
                        // Move and zoom only: rotation is on its own slider, so pinching never turns it.
                        detectTransformGestures(panZoomLock = true) { _, pan: Offset, zoom, _ ->
                            frame = frame.copy(
                                zoom = (frame.zoom * zoom).coerceIn(PhotoFrame.MIN_ZOOM, PhotoFrame.MAX_ZOOM),
                                offsetX = frame.offsetX + pan.x,
                                offsetY = frame.offsetY + pan.y,
                            )
                        }
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    drawIntoCanvas { it.nativeCanvas.drawBitmap(source, frame.matrix(source.width, source.height, size.width), paint) }
                    // Thirds, to help centre a face.
                    val third = size.width / 3
                    for (i in 1..2) {
                        drawLine(BarLabColors.Gold.copy(alpha = 0.3f), Offset(third * i, 0f), Offset(third * i, size.height), 1f)
                        drawLine(BarLabColors.Gold.copy(alpha = 0.3f), Offset(0f, third * i), Offset(size.width, third * i), 1f)
                    }
                }
            }
            Row(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.crop_zoom), style = MaterialTheme.typography.labelLarge, color = BarLabColors.Muted)
                Slider(
                    value = frame.zoom,
                    onValueChange = { frame = frame.copy(zoom = it) },
                    valueRange = PhotoFrame.MIN_ZOOM..PhotoFrame.MAX_ZOOM,
                    modifier = Modifier.weight(1f).padding(horizontal = Spacing.m),
                )
            }
            Row(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.crop_rotation), style = MaterialTheme.typography.labelLarge, color = BarLabColors.Muted)
                Slider(
                    value = frame.rotation.coerceIn(-180f, 180f),
                    onValueChange = { frame = frame.copy(rotation = it) },
                    valueRange = -180f..180f,
                    modifier = Modifier.weight(1f).padding(horizontal = Spacing.m),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                OutlinedButton(onClick = {
                    // A quarter turn, kept within the slider's -180°…180°.
                    val next = ((frame.rotation / 90f).roundToInt() + 1) * 90f
                    frame = frame.copy(rotation = if (next > 180f) next - 360f else next)
                }) {
                    Text(stringResource(R.string.crop_rotate).caps(), style = MaterialTheme.typography.labelLarge)
                }
                TextButton(onClick = { frame = PhotoFrame() }) { Text(stringResource(R.string.crop_reset)) }
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.widthIn(max = 420.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.m)) {
                OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.dialog_cancel).caps(), style = MaterialTheme.typography.labelLarge)
                }
                Button(
                    onClick = { if (viewSide > 0f) onDone(PhotoShrinker.render(source, frame, viewSide)) },
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.crop_use).caps(), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}
