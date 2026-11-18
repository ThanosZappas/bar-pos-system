package gr.barlab.negroni.data

import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import java.net.URL

/**
 * The server functions: a Cloudflare Worker (worker/) that speaks Firebase's callable protocol,
 * so calls go through the Firebase SDK with the signed-in person's token as before, only to the
 * Worker's address instead of Cloud Functions.
 */
class Api(private val functions: FirebaseFunctions, baseUrl: String) {
    private val base = baseUrl.trimEnd('/')

    fun callable(name: String): HttpsCallableReference = functions.getHttpsCallableFromUrl(URL("$base/$name"))
}
