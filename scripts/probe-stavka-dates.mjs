import { fetchText } from "../lib/fetch.mjs";

const urls = [
  "https://stavka.tv/matches/soccer",
  "https://stavka.tv/matches/soccer?date=2026-08-25",
  "https://stavka.tv/matches/soccer?date=2026-08-26",
  "https://stavka.tv/matches/soccer?date=2026-08-27",
  "https://stavka.tv/matches/soccer?date=2026-08-28",
  "https://stavka.tv/matches/soccer?date=2026-08-31",
  "https://stavka.tv/matches/soccer?day=1",
  "https://stavka.tv/matches/soccer?day=2",
  "https://stavka.tv/matches",
];

for (const u of urls) {
  const r = await fetchText(u, { timeoutMs: 25000 });
  const t = r.text || "";
  const rows = t.split("MatchesRow match-row").length - 1;
  const dates = [...t.matchAll(/class="event-date"[^>]*>([^<]+)/g)]
    .slice(0, 8)
    .map((m) => m[1].trim());
  const uniqueDates = [...new Set(dates)];
  console.log(
    JSON.stringify({
      status: r.status,
      rows,
      path: u.replace("https://stavka.tv", ""),
      uniqueDates,
    }),
  );
}
