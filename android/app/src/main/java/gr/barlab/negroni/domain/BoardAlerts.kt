package gr.barlab.negroni.domain

/**
 * When the board should alert: for rounds that appear (new) or change (edit/cancel) after the
 * first snapshot. Same logic as web/src/domain/attention.ts (same test cases).
 */
object BoardAlerts {
    enum class Alert { New, Changed }

    fun fingerprint(r: Round): String = "${r.status.wire}:${r.editCount}:${r.editSeen}"

    /** [previous] is null on the first snapshot: nothing that was already there alerts. */
    fun alertFor(previous: Map<String, String>?, rounds: List<Round>): Alert? {
        if (previous == null) return null
        var result: Alert? = null
        for (r in rounds) {
            val before = previous[r.id]
            if (before == fingerprint(r)) continue
            if (r.isChanged) return Alert.Changed
            if (before == null && r.isNew) result = Alert.New
        }
        return result
    }
}
