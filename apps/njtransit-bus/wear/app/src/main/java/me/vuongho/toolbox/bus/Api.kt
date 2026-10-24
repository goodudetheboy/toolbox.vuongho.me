package me.vuongho.toolbox.bus

// Talks to toolbox-njtransit-bus-api (apps/njtransit-bus/api), the same
// service as the web app: it does the timetable, live matching and countdown,
// so the watch only fetches and draws. Mirrors src/lib/api.ts.

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class Stop(val code: String, val name: String, val routes: List<String>)

data class Bus(
    val trip: String,
    val route: String,
    val headsign: String,
    /** Epoch ms it leaves: NJ Transit's estimate when [live], else the timetable's. */
    val at: Long,
    /** NJ Transit is tracking this bus right now. */
    val live: Boolean,
    /** Port Authority-style gate, e.g. "200_1". */
    val gate: String?,
    /** The stop it leaves from (can be a nearby one, e.g. across the street). */
    val stopCode: String,
    val stopName: String,
)

data class Departures(val from: Stop, val to: Stop, val now: Long, val liveOk: Boolean, val buses: List<Bus>)

object Api {
    private suspend fun get(path: String): JSONObject = withContext(Dispatchers.IO) {
        val conn = URL(BuildConfig.API_URL + path).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        try {
            val ok = conn.responseCode in 200..299
            val text = (if (ok) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val body = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (!ok) throw IOException(body.optString("error").ifEmpty { "HTTP ${conn.responseCode}" })
            body
        } finally {
            conn.disconnect()
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun strings(a: JSONArray?) = (0 until (a?.length() ?: 0)).map { a!!.getString(it) }

    private fun stop(o: JSONObject) = Stop(o.getString("code"), o.getString("name"), strings(o.optJSONArray("routes")))

    suspend fun searchStops(q: String): List<Stop> {
        val a = get("/stops?q=${enc(q)}").getJSONArray("stops")
        return (0 until a.length()).map { stop(a.getJSONObject(it)) }
    }

    suspend fun departures(from: String, to: String): Departures {
        val o = get("/departures?from=${enc(from)}&to=${enc(to)}")
        val a = o.getJSONArray("buses")
        val buses = (0 until a.length()).map { i ->
            val b = a.getJSONObject(i)
            val s = b.getJSONObject("stop")
            Bus(
                trip = b.getString("trip"),
                route = b.getString("route"),
                headsign = b.optString("headsign"),
                at = b.getLong("at"),
                live = b.optBoolean("live"),
                gate = if (b.isNull("gate")) null else b.getString("gate"),
                stopCode = s.getString("code"),
                stopName = s.getString("name"),
            )
        }
        return Departures(stop(o.getJSONObject("from")), stop(o.getJSONObject("to")), o.getLong("now"), o.optBoolean("liveOk", true), buses)
    }
}
