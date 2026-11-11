package gr.barlab.negroni.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.admin.ManagedUser
import gr.barlab.negroni.admin.UsersRepository
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.PasswordRules
import gr.barlab.negroni.auth.Rights
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.auth.Usernames
import gr.barlab.negroni.shift.ShiftRepository
import gr.barlab.negroni.ui.auth.authFailureMessage
import gr.barlab.negroni.ui.components.PasswordField
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.home.roleLabel
import gr.barlab.negroni.ui.shift.ServerShiftControls
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Admin only: the dashboard's user management on the phone. Everyone with their status and, for
 * servers, this shift's permission; tap a person to edit name and role, rights, reset the password,
 * deactivate or delete. Changes go through Cloud Functions, so they need a connection.
 */
@Composable
fun UsersScreen(admin: StaffUser, users: UsersRepository, shifts: ShiftRepository, nowMs: Long, onBack: () -> Unit) {
    val list by remember { users.users }.collectAsStateWithLifecycle(initialValue = emptyList())
    val staff by remember(admin.uid) { shifts.staff(admin) }.collectAsStateWithLifecycle(initialValue = emptyList())
    val shiftByUid = staff.associate { (u, s) -> u.uid to s }
    var editing by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = Spacing.l)) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.users), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { creating = true }) { Text(stringResource(R.string.users_new).caps(), style = MaterialTheme.typography.labelLarge) }
        }
        LazyColumn(contentPadding = PaddingValues(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
            items(list, key = { it.user.uid }) { m ->
                Column(Modifier.fillMaxWidth().clickable { editing = m.user.uid }, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(m.user.displayName, style = MaterialTheme.typography.titleMedium, color = if (m.active) MaterialTheme.colorScheme.onSurface else BarLabColors.Faint)
                    Text(
                        listOfNotNull(
                            m.user.username,
                            stringResource(roleLabel(m.user.role)),
                            if (m.active) null else stringResource(R.string.users_deactivated),
                            if (m.user.mustChangePassword) stringResource(R.string.users_must_change) else null,
                            if (m.user.uid == admin.uid) stringResource(R.string.users_you) else null,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (m.user.role == Role.Server && m.active) ServerShiftControls(admin, m.user, shiftByUid[m.user.uid], shifts, nowMs)
                    HorizontalDivider(color = BarLabColors.LineFaint)
                }
            }
        }
    }
    list.firstOrNull { it.user.uid == editing }?.let { m -> UserSheet(admin, m, users, onDismiss = { editing = null }) }
    if (creating) NewUserSheet(users, onDismiss = { creating = false })
}

/** Shared busy/error/notice handling for the sheets' function calls. */
private class Action {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<AuthFailure?>(null)
    var notice by mutableStateOf<Int?>(null)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserSheet(admin: StaffUser, m: ManagedUser, users: UsersRepository, onDismiss: () -> Unit) {
    val user = m.user
    val isMe = user.uid == admin.uid
    val scope = rememberCoroutineScope()
    val action = remember(user.uid) { Action() }
    var name by remember(user.uid) { mutableStateOf(user.displayName) }
    var role by remember(user.uid) { mutableStateOf(user.role) }
    var rights by remember(user.uid) { mutableStateOf(user.rights) }
    var password by remember(user.uid) { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }

    fun run(call: suspend () -> Result<Unit>, done: Int, close: Boolean = false) {
        action.busy = true
        action.error = null
        action.notice = null
        scope.launch {
            call().onSuccess { action.notice = done; if (close) onDismiss() }.onFailure { action.error = it as? AuthFailure }
            action.busy = false
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.l),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            Text(user.displayName, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(user.username, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            action.error?.let { Text(authFailureMessage(it), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium) }
            action.notice?.let { Text(stringResource(it), color = BarLabColors.Green, style = MaterialTheme.typography.bodyMedium) }

            Section(stringResource(R.string.users_name_role))
            OutlinedTextField(value = name, onValueChange = { name = it.take(40) }, label = { Text(stringResource(R.string.users_display_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            RolePicker(role, enabled = !isMe) { role = it }
            Button(enabled = !action.busy && name.isNotBlank(), onClick = { run({ users.rename(user.uid, name, role) }, R.string.users_saved) }) {
                Text(stringResource(R.string.users_save).caps(), style = MaterialTheme.typography.labelLarge)
            }

            if (user.role == Role.Server) {
                Section(stringResource(R.string.users_rights))
                RightsEditor(rights) { rights = it }
                Button(enabled = !action.busy, onClick = { run({ users.setRights(user.uid, rights) }, R.string.users_saved) }) {
                    Text(stringResource(R.string.users_save_rights).caps(), style = MaterialTheme.typography.labelLarge)
                }
            }

            Section(stringResource(R.string.users_reset_password))
            PasswordField(
                value = password,
                onValueChange = { password = it },
                label = stringResource(R.string.users_temp_password),
                supportingText = pluralStringResource(R.plurals.users_temp_password_hint, PasswordRules.MIN_LENGTH, PasswordRules.MIN_LENGTH),
            )
            OutlinedButton(enabled = !action.busy && password.length >= PasswordRules.MIN_LENGTH, onClick = { run({ users.resetPassword(user.uid, password) }, R.string.users_password_reset); password = "" }) {
                Text(stringResource(R.string.users_reset_password).caps(), style = MaterialTheme.typography.labelLarge)
            }

            if (!isMe) {
                Section(stringResource(R.string.users_account))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    OutlinedButton(enabled = !action.busy, onClick = { run({ users.setActive(user.uid, !m.active) }, R.string.users_saved) }) {
                        Text(stringResource(if (m.active) R.string.users_deactivate else R.string.users_activate).caps(), style = MaterialTheme.typography.labelLarge)
                    }
                    TextButton(enabled = !action.busy, onClick = { confirmDelete = true }) { Text(stringResource(R.string.users_delete), color = BarLabColors.Error) }
                }
            }
            Text(" ", modifier = Modifier.padding(bottom = Spacing.l))
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.users_delete_title, user.displayName)) },
            text = { Text(stringResource(R.string.users_delete_body)) },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; run({ users.delete(user.uid) }, R.string.users_deleted, close = true) }) {
                    Text(stringResource(R.string.users_delete), color = BarLabColors.Error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.round_keep)) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewUserSheet(users: UsersRepository, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val action = remember { Action() }
    var username by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf(Role.Server) }
    var password by remember { mutableStateOf("") }
    val usernameOk = Usernames.isValid(Usernames.normalize(username))

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.l),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            Text(stringResource(R.string.users_new), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(
                value = username,
                onValueChange = { username = it.take(32) },
                label = { Text(stringResource(R.string.username)) },
                supportingText = { Text(stringResource(R.string.users_username_hint)) },
                isError = username.isNotEmpty() && !usernameOk,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(value = name, onValueChange = { name = it.take(40) }, label = { Text(stringResource(R.string.users_display_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            RolePicker(role, enabled = true) { role = it }
            PasswordField(
                value = password,
                onValueChange = { password = it },
                label = stringResource(R.string.users_temp_password),
                supportingText = pluralStringResource(R.plurals.users_temp_password_hint, PasswordRules.MIN_LENGTH, PasswordRules.MIN_LENGTH),
            )
            action.error?.let { Text(authFailureMessage(it), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium) }
            Button(
                enabled = !action.busy && usernameOk && name.isNotBlank() && password.length >= PasswordRules.MIN_LENGTH,
                onClick = {
                    action.busy = true
                    action.error = null
                    scope.launch {
                        users.create(username, name, role, password).onSuccess { onDismiss() }.onFailure { action.error = it as? AuthFailure }
                        action.busy = false
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.l),
            ) { Text(stringResource(R.string.users_create).caps(), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
private fun Section(title: String) {
    HorizontalDivider(color = BarLabColors.Line)
    Text(title.caps(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RolePicker(role: Role, enabled: Boolean, onChange: (Role) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        Role.entries.forEachIndexed { i, r ->
            SegmentedButton(
                selected = role == r,
                onClick = { onChange(r) },
                enabled = enabled,
                shape = SegmentedButtonDefaults.itemShape(i, Role.entries.size),
            ) { Text(stringResource(roleLabel(r))) }
        }
    }
}

/** The same rights as the dashboard, with the same defaults. */
@Composable
private fun RightsEditor(rights: Rights, onChange: (Rights) -> Unit) {
    val rows = listOf(
        Triple(R.string.right_log_in, rights.logIn) { v: Boolean -> rights.copy(logIn = v) },
        Triple(R.string.right_no_approval, rights.noApproval) { v: Boolean -> rights.copy(noApproval = v) },
        Triple(R.string.right_payments, rights.payments) { v: Boolean -> rights.copy(payments = v) },
        Triple(R.string.right_reverse_payments, rights.reversePayments) { v: Boolean -> rights.copy(reversePayments = v) },
        Triple(R.string.right_close_tables, rights.closeTables) { v: Boolean -> rights.copy(closeTables = v) },
        Triple(R.string.right_cancel_orders, rights.cancelOrders) { v: Boolean -> rights.copy(cancelOrders = v) },
        Triple(R.string.right_move_tables, rights.moveTables) { v: Boolean -> rights.copy(moveTables = v) },
    )
    Column {
        rows.forEach { (label, value, update) ->
            Row(
                Modifier.fillMaxWidth().toggleable(value = value, role = SemanticsRole.Switch, onValueChange = { onChange(update(it)) }).padding(vertical = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(label), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(checked = value, onCheckedChange = null)
            }
        }
    }
}
