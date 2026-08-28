/**
 * Footbot-стиль: Safe Accumulator.
 * Ноги: P > 70%, кф 1.45–1.90, без пересечения команд.
 * Купон 3–4 ноги, суммарный кф ~5–12+.
 */

import { valueEdge } from "./value.mjs";

function round2(x) {
  return Math.round(x * 100) / 100;
}
function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function noOverlap(legs, next) {
  const used = new Set(legs.flatMap((l) => [l.home, l.away]));
  return !used.has(next.home) && !used.has(next.away);
}

function candidateFromMatch(m) {
  if (m.isLive) return null;
  const picks = [];
  const push = (p, src) => {
    if (!p?.label) return;
    let odds = Number(p.odds);
    const prob = Number(p.prob);
    if (!(prob >= 0.68)) return;
    if (!Number.isFinite(odds) || odds < 1.01 || odds < 1.4 || odds > 1.95) {
      // Safe-коридор: если линия слишком короткая/длинная — оценка из P
      odds = Math.round(Math.min(1.9, Math.max(1.55, (1 / prob) * 0.95)) * 100) / 100;
    }
    if (!(odds >= 1.4 && odds <= 1.95)) return;
    picks.push({
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      sport: m.sport || "football",
      sportLabel: m.sportLabel || "Футбол",
      market: p.label,
      code: p.code || p.label,
      odds,
      prob,
      value: valueEdge(prob, odds),
      tier: "A",
      source: src || p.source || "model",
      periods: m.periods || [],
    });
  };

  push(m.aiPick, m.aiPick?.source);
  if (m.recommendation) push(m.recommendation, "model");
  for (const o of m.outcomes || []) push(o, o.source);
  if (!picks.length) return null;
  picks.sort((a, b) => (b.prob || 0) - (a.prob || 0));
  return picks[0];
}

function buildSafeFromPool(pool, { targetLegs = 3, minOdds = 4.5, maxOdds = 14 } = {}) {
  const sorted = [...pool].sort((a, b) => (b.prob || 0) - (a.prob || 0));
  const legs = [];
  for (const item of sorted) {
    if (!noOverlap(legs, item)) continue;
    legs.push(item);
    if (legs.length >= targetLegs) break;
  }
  if (legs.length < 3) return null;

  let totalOdds = 1;
  let comboProb = 1;
  for (const l of legs) {
    totalOdds *= l.odds;
    comboProb *= l.prob;
  }
  // подогнать к коридору 5–12: если мало — добрать 4-ю; если много — убрать самую дорогую
  if (totalOdds < minOdds && legs.length < 4) {
    for (const item of sorted) {
      if (!noOverlap(legs, item)) continue;
      if (legs.some((l) => l.home === item.home && l.away === item.away)) continue;
      legs.push(item);
      totalOdds *= item.odds;
      comboProb *= item.prob;
      break;
    }
  }
  while (totalOdds > maxOdds && legs.length > 3) {
    let hi = 0;
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].odds > legs[hi].odds) hi = i;
    }
    const cut = legs.splice(hi, 1)[0];
    totalOdds /= cut.odds;
    comboProb /= cut.prob;
  }
  if (totalOdds < minOdds * 0.9 || legs.length < 3) return null;

  return {
    is_express: true,
    kind: "safe_accumulator",
    size: legs.length,
    title: `SAFE ×${legs.length}`,
    total_odds: round2(totalOdds),
    comboProb: round3(comboProb),
    riskNote: "Safe Accumulator: P>70% · кф ноги 1.45–1.90 · цель купона ~5–12",
    matches: legs.map((l) => ({
      home: l.home,
      away: l.away,
      kickoff: l.kickoff,
      league: l.league,
      sport: l.sport,
      sportLabel: l.sportLabel,
      market: l.market,
      code: l.code,
      odds: l.odds,
      prob: l.prob,
      value: l.value,
      tier: l.tier,
      source: l.source,
    })),
  };
}

/**
 * @param {object[]} matches
 * @param {"today"|"3days"} period
 */
export function buildSafeAccumulator(matches, period = "today") {
  const pool = [];
  for (const m of matches || []) {
    if (m.isLive) continue;
    const tags = m.periods || [];
    if (period === "today" && !tags.includes("today")) continue;
    if (period === "3days" && !(tags.includes("today") || tags.includes("3days")))
      continue;
    const c = candidateFromMatch(m);
    if (c) pool.push(c);
  }
  return buildSafeFromPool(pool, { targetLegs: 3 });
}

export function buildSafeAccumulators(matches) {
  return {
    today: buildSafeAccumulator(matches, "today"),
    "3days": buildSafeAccumulator(matches, "3days"),
  };
}
