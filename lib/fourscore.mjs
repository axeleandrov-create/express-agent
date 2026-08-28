import { fetchText } from "./fetch.mjs";

const EVENTS_URLS = ["https://4score.ru/events/", "https://4score.ru/"];
const HORIZON_MS = 7 * 24 * 3600_000;

const SPORT_RULES = [
  { sport: "hockey", re: /хокке|nhl|кхл|nhl|hockey/i },
  { sport: "basketball", re: /баскет|nba|euroleague|basket/i },
  { sport: "tennis", re: /теннис|atp|wta|tennis/i },
  { sport: "volleyball", re: /волейбол|volley/i },
  { sport: "handball", re: /гандбол|handball/i },
  { sport: "cybersport", re: /кибер|dota|cs.?go|lol|cybersport/i },
];

function detectSport(league) {
  const s = String(league || "");
  for (const r of SPORT_RULES) {
    if (r.re.test(s)) return r.sport;
  }
  return "football";
}

function sportLabel(sport) {
  return (
    {
      football: "Футбол",
      hockey: "Хоккей",
      basketball: "Баскетбол",
      tennis: "Теннис",
      volleyball: "Волейбол",
      handball: "Гандбол",
      cybersport: "Киберспорт",
    }[sport] || "Спорт"
  );
}

function kickoffFromParts(dateM, time) {
  if (!dateM) return null;
  const [, dd, mm, yyyy] = dateM;
  const [hour, minute] = (time || "12:00").split(":").map(Number);
  return new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), (hour || 0) - 3, minute || 0),
  ).toISOString();
}

function parseMinute(statusText) {
  const t = (statusText || "").trim();
  if (!t) return "LIVE";
  if (/перерыв|HT|half/i.test(t)) return "HT";
  if (/доп/i.test(t)) return "ET";
  if (t === "'" || t === "’") return "LIVE";
  const m = t.match(/^(\d{1,3})/);
  return m ? `${m[1]}'` : t.slice(0, 8);
}

function parseScore(block) {
  const h = block.match(/lg__score-localteam[^>]*>(\d+)/)?.[1];
  const a = block.match(/lg__score-visitorteam[^>]*>(\d+)/)?.[1];
  if (h == null || a == null) return null;
  return {
    homeGoals: Number(h),
    awayGoals: Number(a),
    display: `${h}:${a}`,
  };
}

function parseBlock(block, league, now, horizon, { live }) {
  if (/Завершено/i.test(block) && !live) return null;

  const teams = [...block.matchAll(/class="lg__team">([^<]+)/g)].map((m) =>
    m[1].trim(),
  );
  if (teams.length < 2) return null;

  const href = block.match(/href="(\/events\/[^"]+)"/)?.[1] ?? null;
  const dateM = href?.match(/(\d{2})-(\d{2})-(\d{4})/);
  const time = block.match(/class="lg__time">(\d{1,2}:\d{2})/)?.[1];

  let statusText = live
    ? block.match(/class="lg__status-live"[^>]*>([^<]+)/)?.[1]?.trim() ?? "LIVE"
    : block.match(/class="lg__status"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";

  let kickoff = kickoffFromParts(dateM, time);
  if (!kickoff && live) {
    kickoff = new Date(now - 30 * 60_000).toISOString();
  }
  if (!kickoff) return null;

  if (!live) {
    const kickMs = new Date(kickoff).getTime();
    if (kickMs <= now || kickMs > horizon) return null;
  }

  const score = parseScore(block);
  const sport = detectSport(league);

  return {
    home: teams[0],
    away: teams[1],
    kickoff,
    league,
    sport,
    sportLabel: sportLabel(sport),
    href: href ? `https://4score.ru${href}` : null,
    source: "4score",
    isLive: live,
    isFinished: false,
    minute: live ? parseMinute(statusText) : null,
    statusText: live ? statusText || "LIVE" : null,
    score,
    homeGoals: score?.homeGoals ?? null,
    awayGoals: score?.awayGoals ?? null,
  };
}

function extractFromHtml(html, now, horizon, seenPrematch, seenLive) {
  const prematch = [];
  const live = [];

  for (const leagueChunk of html.split(/class="lg(?: active)?"/).slice(1)) {
    const country =
      leagueChunk.match(/class="lg__loc">([^:<]+)/)?.[1]?.trim() ?? "";
    const leagueName =
      leagueChunk.match(/class="lg__name"[^>]*>([^<]+)/)?.[1]?.trim() ??
      "Футбол";
    const league = country ? `${country} · ${leagueName}` : leagueName;

    for (const block of leagueChunk.split('class="lg__block"').slice(1)) {
      const isLive = /lg__status-live/i.test(block);
      if (/Завершено/i.test(block)) continue;

      if (isLive) {
        const row = parseBlock(block, league, now, horizon, { live: true });
        if (!row) continue;
        const key = `live|${row.home}|${row.away}`.toLowerCase();
        if (seenLive.has(key)) continue;
        seenLive.add(key);
        live.push(row);
        continue;
      }

      if (!/Не началось|Ожидает обновления/i.test(block)) continue;
      const row = parseBlock(block, league, now, horizon, { live: false });
      if (!row) continue;
      const key = `${row.home}|${row.away}|${row.kickoff}`.toLowerCase();
      if (seenPrematch.has(key)) continue;
      seenPrematch.add(key);
      prematch.push(row);
    }
  }
  return { prematch, live };
}

/**
 * Календарь + лайв с 4score (events + главная).
 */
export async function fetchFourScoreBoard(horizonMs = HORIZON_MS) {
  const now = Date.now();
  const horizon = now + horizonMs;
  const seenPrematch = new Set();
  const seenLive = new Set();
  const prematch = [];
  const live = [];
  let lastError = null;
  let okAny = false;

  for (const url of EVENTS_URLS) {
    const res = await fetchText(url, { timeoutMs: 30_000 });
    if (!res.ok || !res.text) {
      lastError = res.error || `HTTP ${res.status || 0}`;
      continue;
    }
    okAny = true;
    const part = extractFromHtml(res.text, now, horizon, seenPrematch, seenLive);
    prematch.push(...part.prematch);
    live.push(...part.live);
  }

  if (!okAny) {
    return {
      ok: false,
      source: "4score",
      sourceUrl: EVENTS_URLS[0],
      matches: [],
      live: [],
      error: lastError || "4score недоступен",
    };
  }

  prematch.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  return {
    ok: true,
    source: "4score",
    sourceUrl: EVENTS_URLS[0],
    matches: prematch,
    live,
    matchCount: prematch.length,
    liveCount: live.length,
    error: null,
  };
}

export { sportLabel, detectSport };
