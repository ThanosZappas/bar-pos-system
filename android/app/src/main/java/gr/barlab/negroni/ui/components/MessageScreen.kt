package gr.barlab.negroni.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import gr.barlab.negroni.R
import gr.barlab.negroni.ui.theme.Spacing

/** Full-screen notice (loading, deactivated, not configured) with an optional sign-out. */
@Composable
fun MessageScreen(title: String, body: String? = null, onSignOut: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.xxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.m, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandHeader(Modifier.padding(bottom = Spacing.xxxl))
        Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
        body?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary, textAlign = TextAlign.Center) }
        onSignOut?.let { TextButton(onClick = it) { Text(stringResource(R.string.switch_user)) } }
    }
}
