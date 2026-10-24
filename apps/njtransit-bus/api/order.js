// The order buses are shown in: soonest first, but a bus NJ Transit is
// tracking beats the timetable. A timetable-only bus listed before the last
// tracked one is most likely that bus running late or one that isn't coming,
// so timetable buses only show after the last tracked one.

export function liveFirst(buses) {
  const sorted = [...buses].sort((a, b) => a.at - b.at);
  let lastLive = -Infinity;
  for (const b of sorted) if (b.live) lastLive = b.at;
  return sorted.filter((b) => b.live || b.at > lastLive);
}
