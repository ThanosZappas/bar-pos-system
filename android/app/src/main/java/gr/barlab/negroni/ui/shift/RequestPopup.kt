package gr.barlab.negroni.ui.shift

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.domain.BoardAlerts
import gr.barlab.negroni.shift.Shift
import gr.barlab.negroni.shift.ShiftRepository
import gr.barlab.negroni.ui.board.BoardAlerter
import gr.barlab.negroni.ui.theme.BarLabColors

/**
 * Barman/admin: a popup for each server asking to start, oldest first, with the board alert sound
 * (if switched on in Settings). Answering on another device closes it here too.
 */
@Composable
fun RequestPopup(lead: StaffUser, shifts: ShiftRepository) {
    val pending by remember(lead.uid) { shifts.pendingRequests() }.collectAsStateWithLifecycle(initialValue = emptyList())
    val context = LocalContext.current
    val alerter = remember { BoardAlerter(context.applicationContext) }
    var announced by remember { mutableStateOf(emptySet<String>()) }
    LaunchedEffect(pending) {
        val fresh = pending.map { it.uid }.toSet() - announced
        if (fresh.isNotEmpty()) alerter.play(BoardAlerts.Alert.New)
        announced = pending.map { it.uid }.toSet()
    }
    val request = pending.firstOrNull() ?: return
    AlertDialog(
        onDismissRequest = {}, // must be answered
        title = { Text(stringResource(R.string.permission_popup_title)) },
        text = { Text(stringResource(R.string.permission_popup_body, request.displayName)) },
        confirmButton = {
            TextButton(onClick = { shifts.decide(lead, request.uid, request.displayName, Shift.Status.Approved) }) {
                Text(stringResource(R.string.permission_allow))
            }
        },
        dismissButton = {
            TextButton(onClick = { shifts.decide(lead, request.uid, request.displayName, Shift.Status.Denied) }) {
                Text(stringResource(R.string.permission_deny), color = BarLabColors.Error)
            }
        },
    )
}
