/**
 * Understat xG (топ-5 лиг) через getLeagueData/{league}/{season}.
 */
import { bestFuzzyMatch, normalizeTeamName } from "./names.mjs";

const LEAGUES = ["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1"];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function currentSeasonYear(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return m >= 7 ? y : y - 1;
}

async function fetchLeagueJson(league, season) {
  const url = `https://understat.com/getLeagueData/${league}/${season}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `https://understat.com/league/${league}/${season}`,
        Cookie: "beget=begetok",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, teams: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const teamsObj = data?.teams;
    if (!teamsObj || typeof teamsObj !== "object") {
      return { ok: false, teams: [], error: "no teams" };
    }
    return { ok: true, teams: Object.values(teamsObj), error: null };
  } catch (e) {
    return { ok: false, teams: [], error: e.message || String(e) };
  }
}

function teamStrength(teamObj) {
  const history = teamObj?.history;
  if (!Array.isArray(history) || !history.length) return null;

  let xg = 0;
  let xga = 0;
  let n = 0;
  for (const g of history) {
    const xf = Number(g.xG);
    const xa = Number(g.xGA);
    if (!Number.isFinite(xf) || !Number.isFinite(xa)) continue;
    xg += xf;
    xga += xa;
    n++;
  }
  if (n < 1) return null;

  const avgXg = xg / n;
  const avgXga = xga / n;
  const attack = Math.max(0.4, Math.min(2.2, avgXg / 1.35));
  const defense = Math.max(0.4, Math.min(2.2, avgXga / 1.15));

  return {
    title: teamObj.title || teamObj.name || "",
    sampleSize: n,
    avgXg: Math.round(avgXg * 1000) / 1000,
    avgXga: Math.round(avgXga * 1000) / 1000,
    attack,
    defense,
  };
}

export async function loadUnderstatIndex(opts = {}) {
  const season = opts.season || currentSeasonYear();
  const fallback = season - 1;
  const byLeague = {};
  const allTitles = new Set();
  let okLeagues = 0;
  const errors = [];

  for (const league of opts.leagues || LEAGUES) {
    let pack = await fetchLeagueJson(league, season);
    if (!pack.ok || !pack.teams.length) {
      pack = await fetchLeagueJson(league, fallback);
    }
    if (!pack.ok) {
      errors.push(`${league}: ${pack.error}`);
      byLeague[league] = { map: new Map(), titles: [] };
      continue;
    }
    const map = new Map();
    const titles = [];
    for (const t of pack.teams) {
      const s = teamStrength(t);
      if (!s?.title) continue;
      map.set(s.title, s);
      titles.push(s.title);
      allTitles.add(s.title);
    }
    byLeague[league] = { map, titles };
    if (map.size) okLeagues++;
  }

  return {
    ok: okLeagues > 0,
    season,
    byLeague,
    allTitles: [...allTitles],
    teamCount: allTitles.size,
    error: okLeagues ? null : errors.join("; ") || "Understat пуст",
  };
}

export function findUnderstatTeam(index, leagueId, teamName) {
  if (!index?.byLeague) return null;
  const bucket = index.byLeague[leagueId] || null;
  const pool = bucket?.titles?.length ? bucket.titles : index.allTitles || [];
  if (!pool.length) return null;
  const hit = bestFuzzyMatch(teamName, pool, 0.72);
  if (!hit?.name) return null;
  if (bucket?.map?.has(hit.name)) {
    return { ...bucket.map.get(hit.name), score: hit.score };
  }
  for (const lg of Object.keys(index.byLeague)) {
    const m = index.byLeague[lg].map;
    if (m.has(hit.name)) return { ...m.get(hit.name), score: hit.score, league: lg };
  }
  return null;
}

export { normalizeTeamName, currentSeasonYear };
