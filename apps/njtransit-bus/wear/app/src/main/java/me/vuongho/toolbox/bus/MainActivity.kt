package me.vuongho.toolbox.bus

// The app: the board for the saved trip (next bus big, then the rest), a flip
// button, and the stop picker. Stops are picked here on the watch, by voice or
// keyboard (stop name or the number on the sign), since the watch can't see
// what was picked in the phone's browser.

import android.app.RemoteInput
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Text
import androidx.wear.input.RemoteInputIntentHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val REFRESH_MS = 20_000L

private val blue = Color(BLUE)
private val white = Color(WHITE)

class MainActivity : ComponentActivity() {
    /** A newer build is out but this app isn't allowed to install it yet. */
    private val needsPermission = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Updater.schedule(this)
        setContent { App(needsPermission.value, ::allowUpdates) }
    }

    // Each time the app comes up (also back from the permission screen).
    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            needsPermission.value = Updater.check(this@MainActivity, interactive = true) == Updater.Result.NEEDS_PERMISSION
        }
    }

    private fun allowUpdates() {
        runCatching {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        }
    }
}

private sealed interface Screen {
    data object Board : Screen
    data object Setup : Screen
    data class Results(val key: String, val query: String) : Screen
}

@Composable
private fun App(needsPermission: Boolean, onAllowUpdates: () -> Unit) {
    val ctx = LocalContext.current
    var trip by remember { mutableStateOf(Store.trip(ctx)) }
    var screen by remember { mutableStateOf<Screen>(if (trip == null) Screen.Setup else Screen.Board) }
    val reload = { trip = Store.trip(ctx) }

    when (val s = screen) {
        Screen.Board -> trip?.let { t ->
            Board(
                trip = t,
                needsPermission = needsPermission,
                onAllowUpdates = onAllowUpdates,
                onEdit = { screen = Screen.Setup },
                onFlip = {
                    Store.setBack(ctx, !t.back)
                    reload()
                },
            )
        }
        Screen.Setup -> Setup(
            onSearch = { key, q -> screen = Screen.Results(key, q) },
            onDone = {
                reload()
                if (Store.trip(ctx) != null) screen = Screen.Board
            },
        )
        is Screen.Results -> Results(s.key, s.query) { stop ->
            if (stop != null) Store.setStop(ctx, s.key, stop)
            reload()
            screen = Screen.Setup
        }
    }
}

// ------------------------------------------------------------------ board

@Composable
private fun Board(trip: Trip, needsPermission: Boolean, onAllowUpdates: () -> Unit, onEdit: () -> Unit, onFlip: () -> Unit) {
    val fg = if (trip.back) white else blue
    val bg = if (trip.back) blue else white
    var data by remember(trip) { mutableStateOf<Departures?>(null) }
    var error by remember(trip) { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    // Fresh times every 20 s while the screen is on; the clock ticks every 5 s.
    LaunchedEffect(trip) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            launch {
                while (true) {
                    now = System.currentTimeMillis()
                    delay(5_000)
                }
            }
            while (true) {
                try {
                    data = Api.departures(trip.from.code, trip.to.code)
                    error = null
                } catch (e: Exception) {
                    error = e.message ?: "NO SIGNAL"
                }
                delay(REFRESH_MS)
            }
        }
    }

    val d = data
    val buses = d?.let { upcoming(it, now) } ?: emptyList()
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().background(bg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item {
            Text(
                "${tinyName(d?.from?.name ?: trip.from.name)} → ${tinyName(d?.to?.name ?: trip.to.name)}",
                color = fg,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.clickable(onClick = onEdit).padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        val first = buses.firstOrNull()
        if (first == null) {
            item {
                Text(
                    when {
                        d == null && error == null -> "ONE SEC…"
                        error != null -> "NO SIGNAL"
                        else -> "NO BUSES"
                    },
                    color = fg,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(vertical = 16.dp),
                )
            }
        } else {
            item { Hero(first, now, fg, from = trip.from.code) }
            items(buses.drop(1)) { b ->
                val solid = buses.indexOf(b) % 2 == 1
                Tile(b, now, if (solid) bg else fg, if (solid) fg else bg, from = trip.from.code)
            }
            item {
                Text(
                    (if (buses.any { it.live }) "LIVE" else "TIMETABLE · NOT LIVE") +
                        (d?.let { " · ${clockText(it.now)}" } ?: "") + (if (error != null) " · OFFLINE" else ""),
                    color = fg,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        item { Button("⇅  FLIP", fg, bg, onFlip) }
        if (needsPermission) {
            item {
                Text(
                    "A NEW VERSION IS OUT",
                    color = fg,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            item { Button("ALLOW UPDATES", fg, bg, onAllowUpdates) }
        }
    }
}

@Composable
private fun Hero(bus: Bus, now: Long, fg: Color, from: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 4.dp)) {
        if (!bus.live) Text("SCHEDULED", color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        BigTime(bus, now, fg)
        Text(
            "${bus.route} TO ${bus.headsign}",
            color = fg,
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (bus.live) Text("LEAVES ${clockText(bus.at)}", color = fg, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        if (bus.stopCode != from) Text("FROM ${shortName(bus.stopName)}", color = fg, fontSize = 10.sp, textAlign = TextAlign.Center)
        bus.gate?.let { Text("GATE ${gateText(it)}", color = fg, fontSize = 18.sp, fontWeight = FontWeight.Black) }
    }
}

@Composable
private fun BigTime(bus: Bus, now: Long, fg: Color) {
    Row(verticalAlignment = Alignment.Bottom) {
        if (!bus.live) {
            val (time, ampm) = clockText(bus.at).split(' ')
            Text(time, color = fg, fontSize = 44.sp, fontWeight = FontWeight.Black, letterSpacing = (-2).sp)
            Text(" $ampm", color = fg, fontSize = 14.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 8.dp))
        } else {
            val mins = minutesUntil(bus.at, now)
            if (mins == 0L) {
                Text("NOW", color = fg, fontSize = 50.sp, fontWeight = FontWeight.Black, letterSpacing = (-2).sp)
            } else {
                Text("$mins", color = fg, fontSize = 64.sp, fontWeight = FontWeight.Black, letterSpacing = (-3).sp)
                Text(" MIN", color = fg, fontSize = 16.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 10.dp))
            }
        }
    }
}

@Composable
private fun Tile(bus: Bus, now: Long, fg: Color, bg: Color, from: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().background(bg).padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Column {
            Text(
                if (!bus.live) clockText(bus.at) else minutesUntil(bus.at, now).let { if (it == 0L) "NOW" else "$it MIN" },
                color = fg,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
            )
            Text(if (bus.live) clockText(bus.at) else "SCHED", color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(bus.route, color = fg, fontSize = 18.sp, fontWeight = FontWeight.Black)
            val sub = bus.gate?.let { "GATE ${gateText(it)}" } ?: if (bus.stopCode != from) "FROM ${tinyName(bus.stopName)}" else bus.headsign
            Text(sub, color = fg, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Button(label: String, fg: Color, bg: Color, onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.padding(top = 8.dp).background(fg).clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Text(label, color = bg, fontSize = 14.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
    }
}

// ------------------------------------------------------------------ setup

@Composable
private fun Setup(onSearch: (key: String, query: String) -> Unit, onDone: () -> Unit) {
    val ctx = LocalContext.current
    var asking by remember { mutableStateOf<String?>(null) }
    val input = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val q = r.data?.let { RemoteInput.getResultsFromIntent(it)?.getCharSequence("q")?.toString()?.trim() }
        val key = asking
        if (key != null && !q.isNullOrEmpty()) onSearch(key, q)
    }
    fun ask(key: String) {
        asking = key
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(
            intent,
            listOf(RemoteInput.Builder("q").setLabel("Stop name or number").build()),
        )
        input.launch(intent)
    }
    val home = Store.stop(ctx, "home")
    val dest = Store.stop(ctx, "dest")

    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(white), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text("YOUR TRIP", color = blue, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) }
        item { Field("HOME", home, solid = true) { ask("home") } }
        item { Field("TO", dest, solid = false) { ask("dest") } }
        if (home != null && dest != null) item { Button("SHOW BUSES", blue, white, onDone) }
    }
}

@Composable
private fun Field(label: String, stop: Stop?, solid: Boolean, onClick: () -> Unit) {
    val fg = if (solid) white else blue
    val bg = if (solid) blue else white
    Column(
        modifier = Modifier.fillMaxWidth().background(bg).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Text(label, color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        Text(stop?.let { shortName(it.name) } ?: "TAP TO PICK", color = fg, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 2)
    }
}

@Composable
private fun Results(key: String, query: String, onPick: (Stop?) -> Unit) {
    var stops by remember { mutableStateOf<List<Stop>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(query) {
        try {
            stops = Api.searchStops(query)
        } catch (e: Exception) {
            error = e.message ?: "NO SIGNAL"
        }
    }
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(white), horizontalAlignment = Alignment.CenterHorizontally) {
        item {
            Text(
                "${if (key == "home") "HOME" else "TO"}: “${query.uppercase()}”",
                color = blue,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
        val list = stops
        when {
            error != null -> item { Text("NO SIGNAL", color = blue, fontSize = 18.sp, fontWeight = FontWeight.Black) }
            list == null -> item { Text("ONE SEC…", color = blue, fontSize = 18.sp, fontWeight = FontWeight.Black) }
            list.isEmpty() -> item { Text("NO STOPS FOUND", color = blue, fontSize = 18.sp, fontWeight = FontWeight.Black) }
            else -> items(list.size) { i ->
                val s = list[i]
                val solid = i % 2 == 0
                val fg = if (solid) white else blue
                Column(
                    modifier = Modifier.fillMaxWidth().background(if (solid) blue else white).clickable { onPick(s) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(shortName(s.name), color = fg, fontSize = 13.sp, fontWeight = FontWeight.Black, maxLines = 2)
                    Text(
                        "#${s.code}" + if (s.routes.size in 1..6) " · ${s.routes.joinToString(" ")}" else "",
                        color = fg,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        item { Button("BACK", blue, white) { onPick(null) } }
    }
}
