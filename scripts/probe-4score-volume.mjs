import { fetchText } from "../lib/fetch.mjs";

/** Сколько матчей отдаёт 4score на разных горизонтах. */
function kickoffFromParts(dateM, time) {
  if (!dateM || !time) return null;
  const [, dd, mm, yyyy] = dateM;
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour - 3, minute),
  ).toISOString();
}

function parseFourscore(text, horizonMs) {
  const now = Date.now();
  const horizon = now + horizonMs;
  const rows = [];
  const seen = new Set();
  let live = 0;
  let finished = 0;
  let notStarted = 0;

  for (const leagueChunk of text.split(/class="lg(?: active)?"/).slice(1)) {
    const country = leagueChunk.match(/class="lg__loc">([^:<]+)/)?.[1]?.trim();
    const leagueName = leagueChunk
      .match(/class="lg__name"[^>]*>([^<]+)/)?.[1]
      ?.trim();
    const league =
      country && leagueName
        ? `${country} · ${leagueName}`
        : leagueName || "Футбол";

    for (const block of leagueChunk.split('class="lg__block"').slice(1)) {
      if (/lg__status-live/i.test(block)) {
        live++;
        continue;
      }
      if (/Завершено/i.test(block)) {
        finished++;
        continue;
      }
      if (!/Не началось|Ожидает обновления/i.test(block)) continue;
      notStarted++;

      const time = block.match(/class="lg__time">(\d{1,2}:\d{2})/)?.[1];
      const href = block.match(/href="(\/events\/[^"]+)"/)?.[1];
      const dateM = href?.match(/(\d{2})-(\d{2})-(\d{4})/);
      const kickoff = kickoffFromParts(dateM, time);
      if (!kickoff) continue;
      const kickMs = new Date(kickoff).getTime();
      if (kickMs <= now || kickMs > horizon) continue;

      const teams = [...block.matchAll(/class="lg__team">([^<]+)/g)].map((m) =>
        m[1].trim(),
      );
      if (teams.length < 2) continue;
      const key = `${teams[0]}|${teams[1]}|${kickoff}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ home: teams[0], away: teams[1], kickoff, league, href });
    }
  }
  return { rows, live, finished, notStarted };
}

const urls = [
  "https://4score.ru/events/",
  "https://4score.ru/events/?date=tomorrow",
  "https://4score.ru/football/",
];

for (const url of urls) {
  const r = await fetchText(url, { timeoutMs: 30000 });
  if (!r.ok) {
    console.log(url, "FAIL", r.status);
    continue;
  }
  for (const days of [1, 3, 7]) {
    const p = parseFourscore(r.text, days * 86400_000);
    console.log(
      JSON.stringify({
        url: url.replace("https://4score.ru", ""),
        days,
        matches: p.rows.length,
        live: p.live,
        finished: p.finished,
        notStartedBlocks: p.notStarted,
        sample: p.rows.slice(0, 2).map((x) => `${x.home}-${x.away}`),
      }),
    );
  }
}

// football-data.org без ключа (иногда пускает ограниченно)
const fd = await fetchText(
  "https://api.football-data.org/v4/matches",
  { timeoutMs: 15000 },
);
console.log(
  "football-data",
  fd.status,
  (fd.text || "").slice(0, 120).replace(/\s+/g, " "),
);
