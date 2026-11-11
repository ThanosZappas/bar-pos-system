package gr.barlab.negroni

import android.content.Context
import gr.barlab.negroni.auth.DeviceLogin
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.shift.ShiftRepository
import gr.barlab.negroni.catalog.CatalogRepository
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.pos.NoOpPosGateway
import gr.barlab.negroni.pos.PosGateway
import gr.barlab.negroni.sync.SyncMonitor
import gr.barlab.negroni.data.FirebaseSetup

/** Manual dependency injection: one instance per process, created by [NegroniApp]. */
class AppContainer(context: Context) {
    private val firebase = FirebaseSetup.init(context)

    /** False when neither google-services.json nor an emulator host is configured. */
    val isConfigured: Boolean = firebase != null

    val sessions: SessionRepository? = firebase?.let { SessionRepository(DeviceLogin(context), it.auth, it.firestore, it.functions) }

    val shifts: ShiftRepository? = firebase?.let { ShiftRepository(it.firestore) }

    val catalog: CatalogRepository? = firebase?.let { CatalogRepository(it.firestore, it.functions) }

    /** No real POS yet (design only). Swap in JsonExportPosGateway(File(context.filesDir, "pos")) to export JSON. */
    private val pos: PosGateway = NoOpPosGateway

    val sync: SyncMonitor? = firebase?.let { SyncMonitor(context, it.firestore) }

    val orders: OrdersRepository? = firebase?.let { OrdersRepository(it.firestore, pos, sync) }
}
