package gr.barlab.negroni

import android.content.Context
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.catalog.CatalogRepository
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.pos.NoOpPosGateway
import gr.barlab.negroni.pos.PosGateway
import gr.barlab.negroni.data.FirebaseSetup

/** Manual dependency injection: one instance per process, created by [NegroniApp]. */
class AppContainer(context: Context) {
    private val firebase = FirebaseSetup.init(context)

    /** False when neither google-services.json nor an emulator host is configured. */
    val isConfigured: Boolean = firebase != null

    val sessions: SessionRepository? = firebase?.let { SessionRepository(it.auth, it.firestore, it.functions) }

    val catalog: CatalogRepository? = firebase?.let { CatalogRepository(it.firestore) }

    /** No real POS yet (design only). Swap in JsonExportPosGateway(File(context.filesDir, "pos")) to export JSON. */
    private val pos: PosGateway = NoOpPosGateway

    val orders: OrdersRepository? = firebase?.let { OrdersRepository(it.firestore, pos) }
}
