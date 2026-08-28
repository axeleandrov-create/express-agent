const d = await (await fetch("http://127.0.0.1:3006/api/matches?refresh=1")).json();
const L = d.live_matches?.singles || [];
console.log("live", d.liveCount, "rows", L.length, "total", d.matchCount);
for (const m of L.slice(0, 5)) {
  const p = m.aiPick || m.recommendation;
  console.log(
    "LIVE",
    m.minute,
    m.score?.display,
    m.home,
    "-",
    m.away,
    "->",
    p?.label,
    p?.tier,
    p?.source,
  );
}
console.log(
  "today",
  (d.today_matches?.singles || []).slice(0, 3).map((s) => s.recommendation?.label),
);
console.log(
  "3d",
  (d.three_days_matches?.singles || []).slice(0, 3).map((s) => s.recommendation?.label),
);
