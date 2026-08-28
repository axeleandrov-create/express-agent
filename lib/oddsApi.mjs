/**
 * The Odds API — прематч футбол (h2h + totals).
 * Ключ: ODDS_API_KEY в .env
 */

const BASE = "https://api.the-odds-api.com/v4";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

/** Лиги Understat ↔ Odds API sport keys */
export const LEAGUE_MAP = [
  { id: "EPL", understat: "EPL", oddsKey: "soccer_epl", label: "EPL" },
  { id: "La_liga", understat: "La_liga", oddsKey: "soccer_spain_la_liga", label: "La Liga" },
  { id: "Bundesliga", understat: "Bundesliga", oddsKey: "soccer_germany_bundesliga", label: "Bundesliga" },
  { id: "Serie_A", understat: "Serie_A", oddsKey: "soccer_italy_serie_a", label: "Serie A" },
  { id: "Ligue_1", understat: "Ligue_1", oddsKey: "soccer_france_ligue_one", label: "Ligue 1" },
];

function pickH2h(bookmakers) {
  for (const bk of bookmakers || []) {
    const m = (bk.markets || []).find((x) => x.key === "h2h");
    if (!m?.outcomes?.length) continue;
    const by = {};
    for (const o of m.outcomes) {
      const name = String(o.name || "").toLowerCase();
      if (name === "draw") by.x = Number(o.price);
      else if (!by.p1) by.p1 = { name: o.name, price: Number(o.price) };
      else by.p2 = { name: o.name, price: Number(o.price) };
    }
    // outcomes often: home, away, draw — map by home/away team later
    return { bookmaker: bk.key || bk.title, market: m };
  }
  return null;
}

function oddsFromH2h(market, homeName, awayName) {
  if (!market?.outcomes) return null;
  let p1 = null;
  let p2 = null;
  let x = null;
  for (const o of market.outcomes) {
    const price = Number(o.price);
    if (!(price > 1.01)) continue;
    const n = String(o.name || "");
    if (/^draw$/i.test(n)) x = price;
    else if (n === homeName) p1 = price;
    else if (n === awayName) p2 = price;
  }
  if (p1 == null || p2 == null) {
    // fallback order
    const nonDraw = market.outcomes.filter((o) => !/^draw$/i.test(o.name));
    if (p1 == null && nonDraw[0]) p1 = Number(nonDraw[0].price);
    if (p2 == null && nonDraw[1]) p2 = Number(nonDraw[1].price);
  }
  if (!(p1 > 1.01) && !(p2 > 1.01) && !(x > 1.01)) return null;
  return { p1, x, p2 };
}

function totalsFromBookmakers(bookmakers) {
  for (const bk of bookmakers || []) {
    const m = (bk.markets || []).find((x) => x.key === "totals");
    if (!m?.outcomes?.length) continue;
    let over = null;
    let under = null;
    for (const o of m.outcomes) {
      const point = Number(o.point);
      if (point !== 2.5) continue;
      const price = Number(o.price);
      if (/over/i.test(o.name)) over = price;
      if (/under/i.test(o.name)) under = price;
    }
    if (over > 1.01 || under > 1.01) {
      return { over25: over, under25: under, bookmaker: bk.key || bk.title };
    }
  }
  return { over25: null, under25: null, bookmaker: null };
}

/**
 * @param {string} apiKey
 * @param {{ leagues?: typeof LEAGUE_MAP }} [opts]
 */
export async function fetchOddsApiMatches(apiKey, opts = {}) {
  const key = apiKey || process.env.ODDS_API_KEY || "";
  if (!key) {
    return { ok: false, skipped: true, error: "Нет ODDS_API_KEY", matches: [], remaining: null };
  }

  const leagues = opts.leagues || LEAGUE_MAP;
  const matches = [];
  let remaining = null;
  let lastError = null;

  for (const lg of leagues) {
    const url =
      `${BASE}/sports/${lg.oddsKey}/odds/?regions=eu,uk&markets=h2h,totals` +
      `&oddsFormat=decimal&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(25000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => "", error: e, headers: new Map() }));

    let text = "";
    let status = 0;
    let remHdr = null;
    if (typeof res.text === "function") {
      status = res.status;
      remHdr = res.headers?.get?.("x-requests-remaining");
      text = await res.text();
    } else {
      lastError = res.error?.message || "fetch fail";
      continue;
    }
    if (remHdr != null) remaining = Number(remHdr);
    if (!(res.ok) || !text) {
      lastError = `HTTP ${status || 0} ${lg.oddsKey}`;
      continue;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      lastError = `JSON ${lg.oddsKey}`;
      continue;
    }
    if (!Array.isArray(data)) {
      lastError = data?.message || `bad payload ${lg.oddsKey}`;
      continue;
    }

    for (const ev of data) {
      const home = ev.home_team;
      const away = ev.away_team;
      if (!home || !away) continue;
      const h2hPack = pickH2h(ev.bookmakers);
      const h2h = h2hPack ? oddsFromH2h(h2hPack.market, home, away) : null;
      const totals = totalsFromBookmakers(ev.bookmakers);
      if (!h2h && !totals.over25 && !totals.under25) continue;

      matches.push({
        id: ev.id,
        home,
        away,
        kickoff: ev.commence_time || null,
        league: lg.label,
        leagueId: lg.id,
        understatLeague: lg.understat,
        odds: h2h || { p1: null, x: null, p2: null },
        totals: { over25: totals.over25, under25: totals.under25 },
        bookmaker: h2hPack?.bookmaker || totals.bookmaker || null,
        source: "odds-api",
      });
    }
  }

  return {
    ok: matches.length > 0,
    skipped: false,
    matches,
    remaining,
    error: matches.length ? null : lastError || "Пусто",
  };
}
