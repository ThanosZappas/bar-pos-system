package gr.barlab.negroni.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import gr.barlab.negroni.R
import gr.barlab.negroni.sync.SyncStatus
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Always-visible strip while offline or while changes wait for the server; hidden when synced. */
@Composable
fun SyncBanner(status: SyncStatus) {
    AnimatedVisibility(visible = status != SyncStatus.Synced) {
        val (text, color) = when (status) {
            is SyncStatus.Offline ->
                (if (status.pending == 0) stringResource(R.string.sync_offline) else pluralStringResource(R.plurals.sync_offline_pending, status.pending, status.pending)) to BarLabColors.Rust
            is SyncStatus.Syncing -> pluralStringResource(R.plurals.sync_syncing, status.pending, status.pending) to BarLabColors.Slate
            SyncStatus.Synced -> "" to BarLabColors.Bg
        }
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = BarLabColors.Text,
            modifier = Modifier.fillMaxWidth().background(color).padding(horizontal = Spacing.l, vertical = Spacing.s)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}
