package me.vuongho.toolbox.bus

// Self-update, no store (ADR 0003): CI publishes the newest signed APK and
// watch.json ({ versionCode, sha256 }) next to the web app. The app checks on
// open and about once a day in the background; when there's a newer build it
// downloads it and installs it with PackageInstaller.
//
// The very first update needs a tap ("Update NJT Bus?"), because the first
// install came from a sideloading tool. After that this app is its own
// installer of record, and Android 12+ lets it update itself silently.

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

private const val TAG = "Updater"
private const val BASE = "https://toolbox.vuongho.me/njtransit-bus/"

object Updater {
    enum class Result { UP_TO_DATE, NEEDS_PERMISSION, LATER, INSTALLING, FAILED }

    /** Every ~24 h while on the network; does nothing until the first tap-to-update has happened. */
    fun schedule(c: Context) {
        val work = PeriodicWorkRequestBuilder<UpdateWorker>(24, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("update", ExistingPeriodicWorkPolicy.KEEP, work)
    }

    /** May this app install packages (the "install unknown apps" switch for it)? */
    fun canInstall(c: Context) = c.packageManager.canRequestPackageInstalls()

    // Updates install without asking once this app installed the current version itself.
    private fun silentOk(c: Context) = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        runCatching { c.packageManager.getInstallSourceInfo(c.packageName).installingPackageName }.getOrNull() == c.packageName

    /** [interactive]: the app is on screen, so the one-time confirmation can be shown. */
    suspend fun check(c: Context, interactive: Boolean): Result = withContext(Dispatchers.IO) {
        try {
            val latest = JSONObject(fetch(BASE + "watch.json").decodeToString())
            if (latest.getInt("versionCode") <= BuildConfig.VERSION_CODE) return@withContext Result.UP_TO_DATE
            if (!canInstall(c)) return@withContext Result.NEEDS_PERMISSION
            if (!interactive && !silentOk(c)) return@withContext Result.LATER
            val apk = fetch(BASE + "watch.apk")
            val sha = MessageDigest.getInstance("SHA-256").digest(apk).joinToString("") { "%02x".format(it) }
            if (sha != latest.getString("sha256")) throw IllegalStateException("APK checksum doesn't match watch.json")
            install(c, apk)
            Result.INSTALLING
        } catch (e: Exception) {
            Log.w(TAG, "update check failed", e)
            Result.FAILED
        }
    }

    private fun fetch(url: String): ByteArray {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 60_000
        conn.useCaches = false
        try {
            if (conn.responseCode !in 200..299) throw IllegalStateException("$url: HTTP ${conn.responseCode}")
            return conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }

    private fun install(c: Context, apk: ByteArray) {
        val installer = c.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(c.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("app.apk", 0, apk.size.toLong()).use { out ->
                out.write(apk)
                session.fsync(out)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val done = PendingIntent.getBroadcast(c, id, Intent(c, UpdateReceiver::class.java), flags)
            session.commit(done.intentSender)
        }
    }
}

/** PackageInstaller's answer: shows the one-time confirmation, logs the rest. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i(TAG, "updated")
            else -> Log.w(TAG, "install failed ($status): ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
        }
    }
}

class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): androidx.work.ListenableWorker.Result {
        Updater.check(applicationContext, interactive = false)
        return androidx.work.ListenableWorker.Result.success()
    }
}
