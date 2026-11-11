package gr.barlab.negroni.ui.shift

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.ShiftClock
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.shift.Shift
import gr.barlab.negroni.shift.ShiftRepository
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.table.clock
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Barman/admin: every server and their permission for this shift; allow (also unasked) or revoke. */
@Composable
fun StaffScreen(lead: StaffUser, shifts: ShiftRepository, nowMs: Long, onBack: () -> Unit) {
    val staff by remember(lead.uid) { shifts.staff(lead) }.collectAsStateWithLifecycle(initialValue = emptyList())
    val today = ShiftClock.key(nowMs)
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.staff), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        Text(
            stringResource(R.string.staff_explainer),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Spacing.l),
        )
        LazyColumn(contentPadding = PaddingValues(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
            items(staff, key = { it.first.uid }) { (server, shift) ->
                val current = shift?.takeIf { it.shiftDay == today }
                val approved = current?.approvedAt(nowMs) == true
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(server.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(
                                when {
                                    server.rights.noApproval -> stringResource(R.string.staff_trusted)
                                    approved -> stringResource(R.string.staff_approved, clock(current?.approvedUntilMs ?: 0), current?.decidedByName.orEmpty())
                                    current?.status == Shift.Status.Requested -> stringResource(R.string.staff_asked, clock(current.requestedAtMs ?: 0))
                                    current?.status == Shift.Status.Denied -> stringResource(R.string.staff_denied)
                                    current?.status == Shift.Status.Revoked -> stringResource(R.string.staff_revoked)
                                    else -> stringResource(R.string.staff_not_started)
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (approved || server.rights.noApproval) BarLabColors.Green else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        when {
                            server.rights.noApproval -> Unit
                            approved -> OutlinedButton(onClick = { shifts.decide(lead, server.uid, server.displayName, Shift.Status.Revoked) }) {
                                Text(stringResource(R.string.staff_revoke).caps(), color = BarLabColors.Error, style = MaterialTheme.typography.labelLarge)
                            }
                            else -> Button(onClick = { shifts.decide(lead, server.uid, server.displayName, Shift.Status.Approved) }) {
                                Text(stringResource(R.string.permission_allow).caps(), style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }
                    HorizontalDivider(color = BarLabColors.LineFaint, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}
