package gr.barlab.negroni.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role as SemanticsRole
import gr.barlab.negroni.BuildConfig
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.home.roleLabel
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Account, language (persisted) and version. Admin management stays in the web dashboard. */
@Composable
fun SettingsScreen(user: StaffUser, onBack: () -> Unit, onSignOut: () -> Unit) {
    var language by remember { mutableStateOf(AppLanguage.current()) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.settings), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        Column(Modifier.padding(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Text(stringResource(R.string.settings_account).uppercase(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.settings_signed_in, user.displayName, user.username, stringResource(roleLabel(user.role))), style = MaterialTheme.typography.bodyLarge)
            OutlinedButton(onClick = onSignOut) { Text(stringResource(R.string.sign_out).uppercase(), style = MaterialTheme.typography.labelLarge) }

            HorizontalDivider(color = BarLabColors.Line)
            Text(stringResource(R.string.settings_language).uppercase(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Column(Modifier.selectableGroup()) {
                AppLanguage.entries.forEach { option ->
                    Row(
                        Modifier.fillMaxWidth()
                            .selectable(selected = option == language, role = SemanticsRole.RadioButton, onClick = {
                                language = option
                                AppLanguage.set(option) // recreates the activity in the chosen language
                            })
                            .padding(vertical = Spacing.s),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = option == language, onClick = null)
                        Text(stringResource(option.label), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = Spacing.m))
                    }
                }
            }
            Text(stringResource(R.string.settings_language_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            HorizontalDivider(color = BarLabColors.Line)
            Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
