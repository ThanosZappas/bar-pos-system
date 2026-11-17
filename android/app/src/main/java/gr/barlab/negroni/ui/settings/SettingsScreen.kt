package gr.barlab.negroni.ui.settings

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.profile.ProfileRepository
import gr.barlab.negroni.ui.profile.ProfileAvatar
import gr.barlab.negroni.ui.profile.ProfileLookEditor
import gr.barlab.negroni.ui.profile.iconOf
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role as SemanticsRole
import gr.barlab.negroni.BuildConfig
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.board.BoardAlerter
import gr.barlab.negroni.ui.home.roleLabel
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Account (switch user, remove from this phone), language (persisted), board alerts and version. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    user: StaffUser,
    profiles: ProfileRepository?,
    photo: ImageBitmap?,
    onBack: () -> Unit,
    onChangePin: () -> Unit,
    onSwitchUser: () -> Unit,
    onRemoveFromPhone: () -> Unit,
) {
    var language by remember { mutableStateOf(AppLanguage.current()) }
    val context = LocalContext.current
    var alertsOn by remember { mutableStateOf(BoardAlerter.isEnabled(context)) }
    var confirmRemove by remember { mutableStateOf(false) }
    var editingLook by remember { mutableStateOf(false) }
    if (editingLook && profiles != null) {
        ModalBottomSheet(onDismissRequest = { editingLook = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(Modifier.padding(horizontal = Spacing.l).padding(bottom = Spacing.xxl), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
                Text(stringResource(R.string.settings_change_look), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                ProfileLookEditor(uid = null, role = user.role, icon = user.icon, photo = photo, profiles = profiles)
            }
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text(stringResource(R.string.remove_from_phone_title, user.displayName)) },
            text = { Text(stringResource(R.string.remove_from_phone_body)) },
            confirmButton = { TextButton(onClick = { confirmRemove = false; onRemoveFromPhone() }) { Text(stringResource(R.string.remove)) } },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text(stringResource(R.string.dialog_cancel)) } },
        )
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.settings), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        Column(Modifier.padding(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Text(stringResource(R.string.settings_account).caps(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.m)) {
                ProfileAvatar(iconOf(user.icon, user.role), photo, 56.dp)
                Text(stringResource(R.string.settings_signed_in, user.displayName, user.username, stringResource(roleLabel(user.role))), style = MaterialTheme.typography.bodyLarge)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                if (profiles != null) OutlinedButton(onClick = { editingLook = true }) { Text(stringResource(R.string.settings_change_look).caps(), style = MaterialTheme.typography.labelLarge) }
            }
            OutlinedButton(onClick = onChangePin) { Text(stringResource(R.string.settings_change_pin).caps(), style = MaterialTheme.typography.labelLarge) }
            HorizontalDivider(color = BarLabColors.LineFaint)
            OutlinedButton(onClick = onSwitchUser) { Text(stringResource(R.string.switch_user).caps(), style = MaterialTheme.typography.labelLarge) }
            Text(stringResource(R.string.switch_user_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { confirmRemove = true }) { Text(stringResource(R.string.remove_me_from_phone)) }

            HorizontalDivider(color = BarLabColors.Line)
            Text(stringResource(R.string.settings_language).caps(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
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

            if (user.role.seesOrderBoard) {
                HorizontalDivider(color = BarLabColors.Line)
                Text(stringResource(R.string.settings_board).caps(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                Row(
                    Modifier.fillMaxWidth().toggleable(value = alertsOn, role = SemanticsRole.Switch, onValueChange = {
                        alertsOn = it
                        BoardAlerter.setEnabled(context, it)
                    }),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.board_alerts), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f).padding(end = Spacing.m))
                    Switch(checked = alertsOn, onCheckedChange = null)
                }
            }

            HorizontalDivider(color = BarLabColors.Line)
            Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
