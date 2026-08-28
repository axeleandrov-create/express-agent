/**
 * Экспрессы и одинары по вкладкам — РАЗНЫЙ формат рынков:
 * today  → 1X2 / ДШ (П1, П2, Х, 1X, X2)
 * 3days  → тоталы и комбо (ТБ 1.5, ТБ 2.5, 1X+ТБ, П1+ТБ, ОЗ)
 * week   → валуи / длинные кф (модель bestAny, кф ≥1.80)
 * live   → без экспресса (заглушка)
 */

import { filterByPeriod } from "./periods.mjs";

function round2(x) {
  return Math.round(x * 100) / 100;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function teamsOf(m) {
  return [m.home, m.away];
}

function noTeamOverlap(legs, next) {
  const used = new Set(legs.flatMap(teamsOf));
  return !teamsOf(next).some((t) => used.has(t));
}

function pack(title, type, legs) {
  let totalOdds = 1;
  let comboProb = 1;
  let valueSum = 0;
  for (const l of legs) {
    totalOdds *= Number(l.odds) || 1;
    comboProb *= Number(l.prob) || 0;
    valueSum += Number(l.value) || 0;
  }
  return {
    is_express: true,
    type,
    title,
    total_odds: round2(totalOdds),
    comboProb: round3(comboProb),
    valueSum: round3(valueSum),
    oddsSource: legs.some((l) => l.oddsSource === "estimate")
      ? "estimate"
      : "stavka",
    matches: legs.map((l) => ({
      home: l.home,
      away: l.away,
      kickoff: l.kickoff,
      league: l.league,
      market: l.market,
      code: l.code,
      odds: l.odds,
      prob: l.prob,
      value: l.value,
      oddsSource: l.oddsSource || "stavka",
    })),
  };
}

function tryGreedy(pool, { minLegs, maxLegs, minOdds, maxOdds, preferProb = true }) {
  const sorted = [...pool].sort((a, b) =>
    preferProb ? b.prob - a.prob : (b.value ?? 0) - (a.value ?? 0),
  );

  for (let n = maxLegs; n >= minLegs; n--) {
    const legs = [];
    for (const item of sorted) {
      if (!noTeamOverlap(legs, item)) continue;
      legs.push(item);
      if (legs.length >= n) break;
    }
    if (legs.length < minLegs) continue;

    let total = legs.reduce((s, l) => s * l.odds, 1);
    if (total >= minOdds && total <= maxOdds) return legs;

    while (legs.length > minLegs) {
      legs.pop();
      total = legs.reduce((s, l) => s * l.odds, 1);
      if (total >= minOdds && total <= maxOdds) return legs;
    }
  }
  return null;
}

function asSingle(m, pick, { format, isTop = false, isSignal = true } = {}) {
  return {
    home: m.home,
    away: m.away,
    kickoff: m.kickoff,
    league: m.league,
    format,
    recommendation: {
      code: pick.code,
      label: pick.label || pick.market || pick.code,
      odds: pick.odds,
      prob: pick.prob,
      value: pick.value ?? 0,
      oddsSource: pick.oddsSource || "stavka",
    },
    isTop,
    isSignal,
    model: m.model ? { ok: m.model.ok, probs: m.model.probs } : { ok: false },
    odds: m.odds,
    thoughts: m.thoughts,
    periods: m.periods,
  };
}

/** Неделя: валуи с более длинным кф (не те же короткие 1X). */
function singlesWeek(matches, limit = 30) {
  const out = [];
  for (const m of matches || []) {
    if (!m.model?.ok) continue;
    const candidates = [];
    // приоритет: длинные комбо / тоталы
    for (const c of m.risk?.combos || []) {
      if (c.odds < 1.9 || c.odds > 5 || c.prob < 0.2) continue;
      if (!["P1_O25", "P2_O25", "BTTS_O25", "O25", "BTTS"].includes(c.code)) continue;
      candidates.push({
        code: c.code,
        label: c.label,
        odds: c.odds,
        prob: c.prob,
        value: c.value,
        oddsSource: c.oddsSource || "estimate",
        rank: 2 + (c.value ?? 0),
      });
    }
    // запас: чистый исход только если кф ≥ 2.2 (не дубль «Сегодня»)
    const r = m.model.bestAny || m.recommendation;
    if (r && r.odds >= 2.2 && ["П1", "П2", "Х"].includes(r.code)) {
      candidates.push({
        code: r.code,
        label: r.label || r.code,
        odds: r.odds,
        prob: r.prob,
        value: r.value ?? 0,
        oddsSource: "stavka",
        rank: r.value ?? 0,
      });
    }
    if (!candidates.length) continue;
    const best = candidates.sort((a, b) => b.rank - a.rank)[0];
    out.push(
      asSingle(m, best, {
        format: "Валуй / длинный кф",
        isTop: (best.value ?? 0) > 0.05,
        isSignal: true,
      }),
    );
  }
  out.sort((a, b) => (b.recommendation?.odds || 0) - (a.recommendation?.odds || 0));
  return out.slice(0, limit);
}

function fromRec(m, codes, { minOdds = 1.3, maxOdds = 8 } = {}) {
  const r = m.recommendation || m.model?.bestAny;
  if (!r) return null;
  if (codes && !codes.includes(r.code)) return null;
  if (r.odds < minOdds || r.odds > maxOdds) return null;
  return {
    home: m.home,
    away: m.away,
    kickoff: m.kickoff,
    league: m.league,
    market: r.label || r.code,
    code: r.code,
    odds: r.odds,
    prob: r.prob,
    value: r.value ?? 0,
  };
}

function buildTodayExpress(matches) {
  const pool = [];
  for (const m of matches || []) {
    if (!(m.isSignal || m.isTop || m.model?.ok)) continue;
    const pure = fromRec(m, ["П1", "П2", "Х"], { minOdds: 1.3, maxOdds: 6 });
    if (pure) pool.push(pure);
  }
  for (const m of matches || []) {
    if (!(m.isSignal || m.isTop || m.model?.ok)) continue;
    const dc = fromRec(m, ["1X", "X2"], { minOdds: 1.25, maxOdds: 3.5 });
    if (dc) pool.push(dc);
  }

  const byMatch = new Map();
  for (const leg of pool) {
    const key = `${leg.home}|${leg.away}`;
    const prev = byMatch.get(key);
    if (!prev || leg.prob > prev.prob) byMatch.set(key, leg);
  }
  const uniq = [...byMatch.values()];

  let legs = tryGreedy(uniq, {
    minLegs: 2,
    maxLegs: 3,
    minOdds: 5,
    maxOdds: 14,
    preferProb: true,
  });
  if (!legs) {
    legs = tryGreedy(uniq, {
      minLegs: 2,
      maxLegs: 3,
      minOdds: 4,
      maxOdds: 16,
      preferProb: true,
    });
  }
  return legs ? pack("МЕГА-ЭКСПРЕСС ДНЯ · 1X2", "mega_today", legs) : null;
}

function build3DaysExpress(matches) {
  const pool = [];
  for (const m of matches || []) {
    if (!m.model?.ok) continue;
    const combos = (m.risk?.combos || []).filter(
      (c) =>
        c.prob >= 0.22 &&
        c.odds >= 1.45 &&
        c.odds <= 3.8 &&
        (c.code.includes("O15") ||
          c.code.includes("O25") ||
          c.code === "U25" ||
          c.code === "BTTS" ||
          c.code.includes("BTTS")),
    );
    const best = combos.sort((a, b) => b.prob - a.prob)[0];
    if (!best) continue;
    pool.push({
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      market: best.label,
      code: best.code,
      odds: best.odds,
      prob: best.prob,
      value: best.value,
      oddsSource: best.oddsSource || "estimate",
    });
  }

  let legs = tryGreedy(pool, {
    minLegs: 2,
    maxLegs: 3,
    minOdds: 4.5,
    maxOdds: 15,
    preferProb: true,
  });
  if (!legs) {
    legs = tryGreedy(pool, {
      minLegs: 2,
      maxLegs: 4,
      minOdds: 3.5,
      maxOdds: 18,
      preferProb: true,
    });
  }
  return legs ? pack("ЭКСПРЕСС · ТБ / КОМБО", "combo_3days", legs) : null;
}

function buildWeekExpress(matches) {
  const pool = [];
  for (const m of matches || []) {
    if (!m.model?.ok) continue;
    // длинные комбо / тоталы 2.5 — не короткие 1X
    const cands = (m.risk?.combos || []).filter(
      (c) =>
        ["P1_O25", "P2_O25", "BTTS_O25", "O25"].includes(c.code) &&
        c.odds >= 1.9 &&
        c.odds <= 4.5 &&
        c.prob >= 0.2,
    );
    const best = cands.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    if (best) {
      pool.push({
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        league: m.league,
        market: best.label,
        code: best.code,
        odds: best.odds,
        prob: best.prob,
        value: best.value,
        oddsSource: best.oddsSource || "estimate",
      });
      continue;
    }
    const r = m.model.bestAny;
    if (r && r.odds >= 1.9 && !["1X", "X2"].includes(r.code)) {
      pool.push({
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        league: m.league,
        market: r.label || r.code,
        code: r.code,
        odds: r.odds,
        prob: r.prob,
        value: r.value ?? 0,
      });
    }
  }

  pool.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const legs = tryGreedy(pool, {
    minLegs: 4,
    maxLegs: 5,
    minOdds: 15,
    maxOdds: 80,
    preferProb: false,
  });
  if (legs) return pack("ПАРОВОЗ НЕДЕЛИ · ВАЛУЙ", "week_train", legs);

  const short = tryGreedy(pool, {
    minLegs: 3,
    maxLegs: 3,
    minOdds: 12,
    maxOdds: 80,
    preferProb: false,
  });
  return short ? pack("ПАРОВОЗ НЕДЕЛИ · ВАЛУЙ", "week_train", short) : null;
}

const FORMAT_HINT = {
  live: "LIVE · исход ИИ сразу · без экспресса",
  today: "Формат: 1X2 / ДШ",
  "3days": "Формат: ТБ / комбо",
  week: "Формат: валуй / длинный кф",
};

function singlesLive(matches, limit = 40) {
  return (matches || [])
    .filter((m) => m.isLive)
    .map((m) => {
      const pick = m.aiPick;
      return {
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        league: m.league,
        isLive: true,
        minute: m.minute,
        statusText: m.statusText,
        score: m.score,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        format: "LIVE",
        recommendation: pick
          ? {
              code: pick.code,
              label: pick.label,
              odds: pick.odds,
              prob: pick.prob,
              value: 0,
              oddsSource: pick.source,
              tier: pick.tier,
            }
          : null,
        aiPick: pick,
        isTop: pick?.tier === "A",
        isSignal: Boolean(pick),
        model: m.model ? { ok: m.model.ok, probs: m.model.probs } : { ok: false },
        odds: m.odds,
        periods: m.periods,
      };
    })
    .filter((m) => m.recommendation || true)
    .slice(0, limit);
}

/** Сегодня: 1X2 / ДШ из recommendation или aiPick.family===1x2 */
function singlesToday(matches, limit = 30) {
  const out = [];
  for (const m of matches || []) {
    if (m.isLive) continue;
    let pick = null;
    if (m.recommendation && ["П1", "П2", "Х", "1X", "X2"].includes(m.recommendation.code)) {
      pick = m.recommendation;
    } else if (m.aiPick && m.aiPick.family === "1x2") {
      pick = {
        code: m.aiPick.code,
        label: m.aiPick.label,
        odds: m.aiPick.odds,
        prob: m.aiPick.prob,
        value: 0,
        oddsSource: m.aiPick.source,
      };
    }
    if (!pick) continue;
    out.push(
      asSingle(m, pick, {
        format: "1X2 / ДШ",
        isTop: m.isTop || m.aiPick?.tier === "A",
        isSignal: true,
      }),
    );
  }
  return out.slice(0, limit);
}

/** 3 дня: тоталы из ai outcomes или risk */
function singles3Days(matches, limit = 30) {
  const out = [];
  for (const m of matches || []) {
    if (m.isLive) continue;
    const fromAi = (m.outcomes || []).find((o) => o.family === "total");
    if (fromAi) {
      out.push(
        asSingle(
          m,
          {
            code: fromAi.code,
            label: fromAi.label,
            odds: fromAi.odds,
            prob: fromAi.prob,
            value: 0,
            oddsSource: fromAi.source,
          },
          {
            format: "ТБ / комбо",
            isTop: fromAi.tier === "A",
            isSignal: true,
          },
        ),
      );
      continue;
    }
    if (!m.model?.ok) continue;
    const pool = [
      ...(m.risk?.totalsMarkets || []),
      ...(m.risk?.combos || []).filter((c) =>
        ["O15", "O25", "U25", "BTTS", "1X_O15", "X2_O15"].includes(c.code),
      ),
    ];
    const best = pool.sort((a, b) => b.prob - a.prob)[0];
    if (!best || best.prob < 0.4) continue;
    out.push(
      asSingle(
        m,
        {
          code: best.code,
          label: best.label,
          odds: best.odds,
          prob: best.prob,
          value: best.value,
          oddsSource: best.oddsSource || "estimate",
        },
        { format: "ТБ / комбо", isTop: best.prob >= 0.55, isSignal: true },
      ),
    );
  }
  out.sort((a, b) => (b.recommendation?.prob || 0) - (a.recommendation?.prob || 0));
  return out.slice(0, limit);
}

/**
 * Блок периода: матчи + топ-экспресс + одинары своего формата.
 */
export function buildPeriodBucket(matches, period, now = new Date()) {
  const filtered = filterByPeriod(matches, period, now);

  let express = null;
  let singles = [];
  const strategies = [];

  if (period === "live") {
    express = null;
    singles = singlesLive(filtered);
  } else if (period === "today") {
    express = buildTodayExpress(filtered.filter((m) => !m.isLive));
    singles = singlesToday(filtered);
  } else if (period === "3days") {
    express = build3DaysExpress(filtered.filter((m) => !m.isLive));
    singles = singles3Days(filtered);
  } else if (period === "week") {
    express = buildWeekExpress(filtered.filter((m) => !m.isLive));
    singles = singlesWeek(filtered.filter((m) => !m.isLive));
  }

  return {
    period,
    formatHint: FORMAT_HINT[period] || "",
    count: filtered.length,
    signalCount: singles.filter((s) => s.recommendation || s.aiPick).length,
    express,
    strategies,
    singles,
    matches: filtered,
  };
}

export function buildPeriodExpresses(matches, now = new Date()) {
  return {
    live: null,
    today: buildPeriodBucket(matches, "today", now).express,
    "3days": buildPeriodBucket(matches, "3days", now).express,
    week: buildPeriodBucket(matches, "week", now).express,
  };
}

export function buildAllPeriodBuckets(matches, now = new Date()) {
  return {
    live_matches: buildPeriodBucket(matches, "live", now),
    today_matches: buildPeriodBucket(matches, "today", now),
    three_days_matches: buildPeriodBucket(matches, "3days", now),
    week_matches: buildPeriodBucket(matches, "week", now),
  };
}
