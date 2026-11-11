package gr.barlab.negroni.ui.components

import java.text.Normalizer

private val ACUTE = Regex("[\\u0301\\u0341]") // Greek tonos after NFD decomposition

/**
 * Upper case for labels and buttons. Greek capitals are written without accents ("ΣΥΝΔΕΣΗ",
 * not "ΣΎΝΔΕΣΗ"); diaeresis stays. Other languages are unaffected.
 */
fun String.caps(): String = Normalizer.normalize(
    ACUTE.replace(Normalizer.normalize(uppercase(), Normalizer.Form.NFD), ""),
    Normalizer.Form.NFC,
)
