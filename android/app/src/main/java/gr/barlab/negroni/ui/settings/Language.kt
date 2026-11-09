package gr.barlab.negroni.ui.settings

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import gr.barlab.negroni.R

/**
 * In-app language. AppCompat stores the choice (and Android 13+ shows it under the app's system
 * settings), so it survives restarts. Greek is listed but not translated yet: values-el is empty
 * and every string falls back to English.
 */
enum class AppLanguage(val tag: String, val label: Int) {
    English("en", R.string.language_en),
    Greek("el", R.string.language_el);

    companion object {
        fun current(): AppLanguage {
            val tag = AppCompatDelegate.getApplicationLocales()[0]?.language
            return entries.firstOrNull { it.tag == tag } ?: English
        }

        fun set(language: AppLanguage) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language.tag))
        }
    }
}
