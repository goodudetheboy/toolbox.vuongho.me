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

/** Where a bus leaves from when it isn't the picked stop, in few words: just
 * the cross street when it's the same street ("FROM 62ND ST" next to
 * "BOULEVARD EAST AT 60TH ST"), else the short name. */
fun fromText(stopName: String, picked: String): String {
    val street = stopName.split(" AT ", limit = 2)
    val pickedStreet = picked.split(" AT ", limit = 2)[0]
    return if (street.size == 2 && street[0] == pickedStreet) "FROM ${street[1]}" else "FROM ${tinyName(stopName)}"
}
