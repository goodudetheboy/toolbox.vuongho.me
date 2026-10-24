package me.vuongho.toolbox.bus

// The two stops and which way you're going, kept on the watch only (the
// watch can't read the phone browser's localStorage). Mirrors src/lib/saved.ts.

import android.content.Context
import androidx.wear.tiles.TileService

data class Trip(val home: Stop, val dest: Stop, val back: Boolean) {
    val from get() = if (back) dest else home
    val to get() = if (back) home else dest
}

object Store {
    private fun prefs(c: Context) = c.getSharedPreferences("trip", Context.MODE_PRIVATE)

    private fun readStop(c: Context, key: String): Stop? {
        val p = prefs(c)
        val code = p.getString("$key.code", null) ?: return null
        return Stop(code, p.getString("$key.name", "") ?: "", p.getString("$key.routes", "")!!.split(',').filter { it.isNotEmpty() })
    }

    fun stop(c: Context, key: String) = readStop(c, key)

    fun trip(c: Context): Trip? {
        val home = readStop(c, "home") ?: return null
        val dest = readStop(c, "dest") ?: return null
        return Trip(home, dest, prefs(c).getBoolean("back", false))
    }

    fun setStop(c: Context, key: String, s: Stop) {
        prefs(c).edit()
            .putString("$key.code", s.code)
            .putString("$key.name", s.name)
            .putString("$key.routes", s.routes.joinToString(","))
            .apply()
        refreshTile(c)
    }

    fun setBack(c: Context, back: Boolean) {
        prefs(c).edit().putBoolean("back", back).apply()
        refreshTile(c)
    }

    private fun refreshTile(c: Context) = TileService.getUpdater(c).requestUpdate(NextBusTile::class.java)
}
