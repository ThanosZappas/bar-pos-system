package gr.barlab.negroni.ui.board

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.content.edit
import gr.barlab.negroni.domain.BoardAlerts

/**
 * Beep and vibrate for the barman: two short pulses for a new order, three for an edit or a
 * cancellation. Uses the notification volume, so the phone's silent mode still vibrates only.
 * The on/off choice is remembered on the phone.
 */
class BoardAlerter(context: Context) {
    private val prefs = context.getSharedPreferences("board", Context.MODE_PRIVATE)
    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
    private val tones = runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80) }.getOrNull()

    var enabled: Boolean
        get() = prefs.getBoolean(KEY, true)
        set(value) = prefs.edit { putBoolean(KEY, value) }

    fun play(alert: BoardAlerts.Alert) {
        if (!enabled) return
        val changed = alert == BoardAlerts.Alert.Changed
        tones?.startTone(if (changed) ToneGenerator.TONE_PROP_BEEP2 else ToneGenerator.TONE_PROP_BEEP, if (changed) 400 else 200)
        val pattern = if (changed) longArrayOf(0, 180, 120, 180, 120, 180) else longArrayOf(0, 150, 100, 150)
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }

    fun release() = tones?.release()

    private companion object {
        const val KEY = "alerts"
    }
}
