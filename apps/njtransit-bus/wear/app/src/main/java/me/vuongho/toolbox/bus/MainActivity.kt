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
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.focusable
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.gestures.scrollBy
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.input.pointer.pointerInput
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

// Like the web board: the next bus fills the screen; one swipe (or bezel turn)
// down snaps to a plain scrolling list of the rest, with the status line and
// FLIP at the bottom. Scrolling up past the top of the list snaps back.
@OptIn(ExperimentalFoundationApi::class)
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
    val pages = if (buses.size > 0) 2 else 1
    val pager = rememberPagerState(pageCount = { pages })
    val list = rememberScalingLazyListState()
    LaunchedEffect(trip) { pager.scrollToPage(0) }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val title = "${tinyName(d?.from?.name ?: trip.from.name)} → ${tinyName(d?.to?.name ?: trip.to.name)}"

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(bg)
            // Double tap anywhere flips direction (the FLIP button at the end of the list does the same).
            .pointerInput(onFlip) { detectTapGestures(onDoubleTap = { onFlip() }) }
            // Bezel / crown: snap to the list, scroll it, snap back from its top.
            .onRotaryScrollEvent { e ->
                val dy = e.verticalScrollPixels
                scope.launch {
                    when {
                        pager.currentPage == 0 -> if (dy > 0 && pages > 1) pager.animateScrollToPage(1)
                        dy < 0 && !list.canScrollBackward -> pager.animateScrollToPage(0)
                        else -> list.scrollBy(dy)
                    }
                }
                true
            }
            .focusRequester(focus)
            .focusable(),
    ) {
        VerticalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            if (page == 0) {
                Box(Modifier.fillMaxSize().background(bg), contentAlignment = Alignment.Center) {
                    val first = buses.firstOrNull()
                    if (first != null) {
                        BusPage(first, now, fg, trip.from, "NEXT BUS", title, onEdit)
                    } else {
                        Message(
                            when {
                                d == null && error == null -> "ONE SEC…"
                                error != null -> "NO SIGNAL"
                                else -> "NO BUSES"
                            },
                            title, fg, onEdit,
                        )
                    }
                }
            } else {
                ScalingLazyColumn(
                    state = list,
                    modifier = Modifier.fillMaxSize().background(bg),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    item { Text("ALL BUSES", color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) }
                    items(buses.size) { i ->
                        // Alternating, like the web tiles; the first one solid.
                        val solid = i % 2 == 0
                        Tile(buses[i], now, if (solid) bg else fg, if (solid) fg else bg, from = trip.from, next = i == 0)
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
                    item { Button("⇅  FLIP", fg, bg, onFlip) }
                    item { Text("OR DOUBLE TAP", color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                    if (needsPermission) {
                        item { Text("A NEW VERSION IS OUT", color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp)) }
                        item { Button("ALLOW UPDATES", fg, bg, onAllowUpdates) }
                    }
                }
            }
        }
    }
}

@Composable
private fun BusPage(bus: Bus, now: Long, fg: Color, from: Stop, label: String, title: String, onEdit: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 24.dp)) {
        if (label == "NEXT BUS") {
            Text(
                title,
                color = fg,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable(onClick = onEdit).padding(vertical = 4.dp),
            )
        }
        Text(
            if (bus.live) label else "$label · SCHEDULED",
            color = fg,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
        )
        BigTime(bus, now, fg)
        Text(
            "${bus.route} TO ${bus.headsign}",
            color = fg,
            fontSize = 15.sp,
            fontWeight = FontWeight.Black,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (bus.live) Text("LEAVES ${clockText(bus.at)}", color = fg, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        if (bus.stopCode != from.code) {
            Text(fromText(bus.stopName, from.name), color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        }
        bus.gate?.let { Text("GATE ${gateText(it)}", color = fg, fontSize = 20.sp, fontWeight = FontWeight.Black) }
    }
}

@Composable
private fun BigTime(bus: Bus, now: Long, fg: Color) {
    Row(verticalAlignment = Alignment.Bottom) {
        if (!bus.live) {
            val (time, ampm) = clockText(bus.at).split(' ')
            Text(time, color = fg, fontSize = 52.sp, fontWeight = FontWeight.Black, letterSpacing = (-2).sp)
            Text(" $ampm", color = fg, fontSize = 16.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 10.dp))
        } else {
            val mins = minutesUntil(bus.at, now)
            if (mins == 0L) {
                Text("NOW", color = fg, fontSize = 60.sp, fontWeight = FontWeight.Black, letterSpacing = (-2).sp)
            } else {
                Text("$mins", color = fg, fontSize = 84.sp, fontWeight = FontWeight.Black, letterSpacing = (-4).sp)
                Text(" MIN", color = fg, fontSize = 18.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 14.dp))
            }
        }
    }
}

@Composable
private fun Message(text: String, title: String, fg: Color, onEdit: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onEdit).padding(4.dp))
        Text(text, color = fg, fontSize = 26.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun Tile(bus: Bus, now: Long, fg: Color, bg: Color, from: Stop, next: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().background(bg).padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Column {
            if (next) Text("NEXT", color = fg, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
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
            val sub = bus.gate?.let { "GATE ${gateText(it)}" } ?: if (bus.stopCode != from.code) fromText(bus.stopName, from.name) else bus.headsign
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
