/**
 * Пайплайн рекомендаций (аналог services/data_aggregator.py).
 * Odds API → Understat xG → Пуассон/Келли → приоритет.
 */
import {
  calculatePoissonProbability,
  calculateKellyCriterion,
  priorityFromValue,
} from "./footballModels.mjs";
import { fetchOddsApiMatches, LEAGUE_MAP } from "./oddsApi.mjs";
import { loadUnderstatIndex, findUnderstatTeam } from "./understat.mjs";

function ymd(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function pickBestMarket(poisson, odds, totals) {
  const cands = [];
  const push = (type, prob, bookOdds) => {
    if (!(prob > 0) || !(Number(bookOdds) > 1.01)) return;
    const value = prob * Number(bookOdds) - 1;
    cands.push({ type, prob, bookOdds: Number(bookOdds), value });
  };
  push("П1", poisson.p1, odds?.p1);
  push("Х", poisson.px, odds?.x);
  push("П2", poisson.p2, odds?.p2);
  push("ТБ 2.5", poisson.over25, totals?.over25);
  push("ТМ 2.5", poisson.under25, totals?.under25);
  if (!cands.length) return null;
  cands.sort((a, b) => b.value - a.value);
  return cands[0];
}

/**
 * @param {string} [apiKey]
 * @param {{ bankroll?: number, kellyFraction?: number, includeSkip?: boolean }} [opts]
 */
export async function getPredictionsPipeline(apiKey, opts = {}) {
  const bankroll = Number(opts.bankroll) > 0 ? Number(opts.bankroll) : 100;
  const kellyFr = Number(opts.kellyFraction) > 0 ? Number(opts.kellyFraction) : 0.1;
  const includeSkip = Boolean(opts.includeSkip);

  const key = apiKey || process.env.ODDS_API_KEY || "";
  const [oddsPack, understat] = await Promise.all([
    fetchOddsApiMatches(key, { leagues: LEAGUE_MAP }),
    loadUnderstatIndex({ leagues: LEAGUE_MAP.map((l) => l.understat) }),
  ]);

  const warnings = [];
  if (!oddsPack.ok) warnings.push(`Odds API: ${oddsPack.error || "нет данных"}`);
  if (!understat.ok) warnings.push(`Understat: ${understat.error || "нет xG"}`);

  const data = [];
  let linked = 0;
  let modeled = 0;

  for (const m of oddsPack.matches || []) {
    const homeU = findUnderstatTeam(understat, m.understatLeague, m.home);
    const awayU = findUnderstatTeam(understat, m.understatLeague, m.away);
    if (!homeU || !awayU) continue;
    linked++;

    const sampleSize = Math.min(homeU.sampleSize || 0, awayU.sampleSize || 0);
    const poisson = calculatePoissonProbability(
      homeU.attack,
      homeU.defense,
      awayU.attack,
      awayU.defense,
      { maxGoals: 5 },
    );
    modeled++;

    const best = pickBestMarket(poisson, m.odds, m.totals);
    if (!best) continue;
    // отсев явного мусора линии / мэтчинга
    if (!(best.prob >= 0.08 && best.prob <= 0.85)) continue;
    if (!(best.bookOdds >= 1.2 && best.bookOdds <= 8)) continue;

    const kelly = calculateKellyCriterion(best.prob, best.bookOdds, bankroll, kellyFr);
    if (kelly.value > 1.2) continue; // unreal edge
    const priority = priorityFromValue(kelly.value, sampleSize);
    if (!includeSkip && priority === "SKIP") continue;

    data.push({
      match: `${m.home} vs ${m.away}`,
      league: m.league || m.leagueId,
      date: ymd(m.kickoff),
      kickoff: m.kickoff,
      prediction_type: best.type,
      bookmaker_odds: Math.round(best.bookOdds * 100) / 100,
      calculated_probability: best.prob,
      value_edge: kelly.value,
      recommended_stake_pct: kelly.stakePct,
      recommended_stake: kelly.stake,
      priority,
      meta: {
        sampleSize,
        understatHome: homeU.title,
        understatAway: awayU.title,
        lambda: poisson.lambda,
        mu: poisson.mu,
        bookmaker: m.bookmaker,
        probs: {
          p1: poisson.p1,
          x: poisson.px,
          p2: poisson.p2,
          over25: poisson.over25,
          under25: poisson.under25,
        },
      },
    });
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2, SKIP: 3 };
  data.sort((a, b) => {
    const pa = rank[a.priority] ?? 9;
    const pb = rank[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.value_edge || 0) - (a.value_edge || 0);
  });

  return {
    status: oddsPack.ok || data.length ? "success" : "error",
    timestamp: new Date().toISOString(),
    data,
    meta: {
      oddsMatches: oddsPack.matches?.length || 0,
      understatTeams: understat.teamCount || 0,
      linked,
      modeled,
      returned: data.length,
      oddsRemaining: oddsPack.remaining,
      warnings,
      kellyFraction: kellyFr,
      bankroll,
    },
    error: data.length ? null : warnings.join(" · ") || "Нет рекомендаций",
  };
}
