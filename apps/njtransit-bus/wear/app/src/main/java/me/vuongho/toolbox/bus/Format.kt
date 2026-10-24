package me.vuongho.toolbox.bus

// Display helpers, the same rules as the web app's src/lib/format.ts:
// everything upper case, in New York time.

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToLong

private val NY = ZoneId.of("America/New_York")
private val clockFmt = DateTimeFormatter.ofPattern("h:mm a", Locale.US).withZone(NY)

/** "2:33 PM" */
fun clockText(ms: Long): String = clockFmt.format(Instant.ofEpochMilli(ms)).uppercase(Locale.US)

/** Minutes until [at], to the nearest minute (as NJ Transit counts), never negative. */
fun minutesUntil(at: Long, now: Long): Long = maxOf(0L, ((at - now) / 60000.0).roundToLong())

/** "200_1" → "200-1", the way NJ Transit writes Port Authority gates. */
fun gateText(gate: String) = gate.replace('_', '-')

/** "48TH ST AT BERGENLINE AVE" → "48TH ST", "PORT AUTHORITY…" → "PABT": the watch
 * only has room for the short form. */
fun tinyName(name: String) = if (name.contains("PORT AUTHORITY")) "PABT" else name.split(" AT ", " & ")[0]

/** Full name, except Port Authority's. */
fun shortName(name: String) = if (name.contains("PORT AUTHORITY BUS TERMINAL")) "PORT AUTHORITY" else name

/** Buses still worth showing: gone a minute after they leave. */
fun upcoming(d: Departures, now: Long) = d.buses.filter { it.at >= now - 60_000 }
