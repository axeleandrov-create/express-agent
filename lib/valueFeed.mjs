/**
 * Лента ТОП по валую (SignalOdds) + строки DeepBetting.
 */

import { valueEdge, isTopValue, formatDeepLine, VALUE_EDGE } from "./value.mjs";

function estOdds(prob) {
  if (!prob || prob < 0.05) return null;
  return Math.round(Math.min(8, Math.max(1.2, (1 / prob) * 0.92)) * 100) / 100;
}

function pickCandidates(m) {
  const out = [];
  const add = (p, src) => {
    if (!p?.label) return;
    let odds = Number(p.odds);
    if (!Number.isFinite(odds) || odds < 1.01) odds = estOdds(p.prob);
    if (!odds) return;
    const value = valueEdge(p.prob, odds);
    if (value == null) return;
    out.push({
      label: p.label,
      code: p.code || p.label,
      odds,
      prob: p.prob,
      value,
      source: src || p.source || "model",
      family: p.family || "1x2",
    });
  };
  add(m.aiPick, m.aiPick?.source);
  if (m.recommendation) add(m.recommendation, "model");
  for (const o of m.outcomes || []) add(o, o.source || "4score_ai");
  out.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return out;
}

/**
 * ТОП-лента: edge > 8%.
 */
export function buildValueTopFeed(matches, { period = null, limit = 40 } = {}) {
  const rows = [];
  for (const m of matches || []) {
    if (period === "live" && !m.isLive) continue;
    if (period && period !== "live") {
      const tags = m.periods || [];
      if (period === "today" && !tags.includes("today")) continue;
      if (period === "3days" && !(tags.includes("today") || tags.includes("3days")))
        continue;
      if (m.isLive) continue;
    }
    const cands = pickCandidates(m);
    const best = cands.find((c) => c.value > VALUE_EDGE);
    if (!best) continue;
    const line = formatDeepLine({
      label: best.label,
      odds: best.odds,
      home: m.home,
      away: m.away,
      modelPct: best.prob,
      valuePct: best.value,
      tag: "ТОП",
    });
    rows.push({
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      sport: m.sport || "football",
      sportLabel: m.sportLabel || "Футбол",
      isLive: Boolean(m.isLive),
      minute: m.minute || null,
      score: m.score || null,
      aiPick: {
        label: best.label,
        code: best.code,
        odds: best.odds,
        prob: best.prob,
        value: best.value,
        tier: "A",
        family: best.family,
        source: best.source,
        isTop: true,
      },
      value: best.value,
      isTop: true,
      line,
      why: `валуй ${(best.value * 100).toFixed(1)}% · ${best.source}`,
    });
  }
  rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return rows.slice(0, limit);
}

export { isTopValue, VALUE_EDGE };
