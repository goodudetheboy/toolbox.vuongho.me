package me.vuongho.toolbox.bus

// The tile: swipe from the watch face to see when the next bus leaves. It
// fetches fresh times each time the watch asks for it, and the minutes count
// down on the watch in between (a dynamic expression), so they don't go stale.
// Tap anywhere to open the app.

import androidx.concurrent.futures.SuspendToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.TypeBuilders
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicInstant
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicString
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import java.time.Instant

private const val RESOURCES = "1"

class NextBusTile : TileService() {

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        SuspendToFutureAdapter.launchFuture {
            val trip = Store.trip(this@NextBusTile)
            val root = if (trip == null) {
                message(BLUE, WHITE, "PICK YOUR STOPS", "TAP TO OPEN")
            } else {
                val fg = if (trip.back) WHITE else BLUE
                val bg = if (trip.back) BLUE else WHITE
                try {
                    val d = Api.departures(trip.from.code, trip.to.code)
                    val buses = upcoming(d, System.currentTimeMillis())
                    if (buses.isEmpty()) message(fg, bg, "NO BUSES", "${tinyName(d.from.name)} → ${tinyName(d.to.name)}")
                    else board(fg, bg, d, buses)
                } catch (e: Exception) {
                    message(fg, bg, "NO SIGNAL", "TAP TO TRY AGAIN")
                }
            }
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES)
                .setFreshnessIntervalMillis(2 * 60 * 1000)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
                .build()
        }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        SuspendToFutureAdapter.launchFuture { ResourceBuilders.Resources.Builder().setVersion(RESOURCES).build() }

    private fun board(fg: Int, bg: Int, d: Departures, buses: List<Bus>): LayoutElement {
        val first = buses[0]
        val col = Column.Builder()
            .addContent(text("${tinyName(d.from.name)} → ${tinyName(d.to.name)}", 12f, fg, bold = true))
            .addContent(Spacer.Builder().setHeight(dp(2f)).build())
        if (first.live) {
            col.addContent(countdown(first, fg))
            col.addContent(text("${first.route} · LEAVES ${clockText(first.at)}", 14f, fg, bold = true))
        } else {
            val (time, ampm) = clockText(first.at).split(' ')
            col.addContent(
                Row.Builder()
                    .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)
                    .addContent(text(time, 40f, fg, bold = true))
                    .addContent(text(" $ampm", 14f, fg, bold = true))
                    .build(),
            )
            col.addContent(text("${first.route} · SCHEDULED", 14f, fg, bold = true))
        }
        first.gate?.let { col.addContent(text("GATE ${gateText(it)}", 14f, fg, bold = true)) }
        buses.getOrNull(1)?.let { col.addContent(text("THEN ${clockText(it.at)}", 12f, fg, bold = false)) }
        return frame(bg, col.build())
    }

    // "9 MIN", counted down on the watch; "NOW" once it's due.
    private fun countdown(bus: Bus, fg: Int): LayoutElement {
        val mins = minutesUntil(bus.at, System.currentTimeMillis())
        // +30 s so the whole-minute count rounds to nearest, like the app.
        val target = DynamicInstant.withSecondsPrecision(Instant.ofEpochMilli(bus.at + 30_000))
        val dynMins = DynamicInstant.platformTimeWithSecondsPrecision().durationUntil(target).toIntMinutes()
        val due = dynMins.lte(0)
        val num = TypeBuilders.StringProp.Builder(if (mins == 0L) "NOW" else "$mins")
            .setDynamicValue(DynamicString.onCondition(due).use("NOW").elseUse(dynMins.format()))
            .build()
        val unit = TypeBuilders.StringProp.Builder(if (mins == 0L) "" else " MIN")
            .setDynamicValue(DynamicString.onCondition(due).use("").elseUse(" MIN"))
            .build()
        return Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)
            .addContent(dynText(num, "NOW", 56f, fg))
            .addContent(dynText(unit, " MIN", 16f, fg))
            .build()
    }

    private fun message(fg: Int, bg: Int, title: String, sub: String) = frame(
        bg,
        Column.Builder()
            .addContent(text(title, 20f, fg, bold = true))
            .addContent(Spacer.Builder().setHeight(dp(6f)).build())
            .addContent(text(sub, 12f, fg, bold = false))
            .build(),
    )

    private fun frame(bg: Int, content: LayoutElement) = Box.Builder()
        .setWidth(expand())
        .setHeight(expand())
        .setModifiers(
            ModifiersBuilders.Modifiers.Builder()
                .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(bg)).build())
                .setClickable(
                    ModifiersBuilders.Clickable.Builder()
                        .setId("open")
                        .setOnClick(
                            ActionBuilders.LaunchAction.Builder()
                                .setAndroidActivity(
                                    ActionBuilders.AndroidActivity.Builder()
                                        .setPackageName(packageName)
                                        .setClassName(MainActivity::class.java.name)
                                        .build(),
                                )
                                .build(),
                        )
                        .build(),
                )
                .build(),
        )
        .addContent(content)
        .build()

    private fun style(size: Float, color: Int, bold: Boolean) = FontStyle.Builder()
        .setSize(sp(size))
        .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
        .setColor(argb(color))
        .build()

    private fun text(s: String, size: Float, color: Int, bold: Boolean) = Text.Builder()
        .setText(s)
        .setMaxLines(1)
        .setFontStyle(style(size, color, bold))
        .build()

    private fun dynText(s: TypeBuilders.StringProp, widest: String, size: Float, color: Int) = Text.Builder()
        .setText(s)
        .setLayoutConstraintsForDynamicText(TypeBuilders.StringLayoutConstraint.Builder(widest).build())
        .setFontStyle(style(size, color, true))
        .build()
}
