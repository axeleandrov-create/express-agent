import { poissonPmf } from "./poisson.mjs";

const MAX_GOALS = 8;
/** Надбавка конторы на «экзотику» (оценка). Stavka эти кф не отдаёт. */
const EXOTIC_SHADE = 0.82;

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

export function buildScoreMatrix(lambda, mu, maxGoals = MAX_GOALS) {
  const cells = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, lambda) * poissonPmf(a, mu);
      cells.push({ h, a, p });
      total += p;
    }
  }
  const norm = total || 1;
  return cells.map((c) => ({ ...c, p: c.p / norm }));
}

function estOddsFromProb(p) {
  if (p < 0.02) return null;
  return round2((1 / p) * EXOTIC_SHADE);
}

function packMarket(code, label, p, extra = {}) {
  const odds = estOddsFromProb(p);
  if (!odds) return null;
  return {
    code,
    label,
    prob: round3(p),
    odds,
    oddsSource: "estimate",
    fairOdds: round2(1 / p),
    value: round3(p * odds - 1),
    ...extra,
  };
}

function sumCells(cells, pred) {
  return cells.reduce((s, c) => (pred(c) ? s + c.p : s), 0);
}

/**
 * Проходимые комбо для разгона: 1X/X2 + ТБ 1.5
 * (фора 0 ≈ двойной шанс — не дублируем).
 */
export function computeRiskMarkets(cells, lambda, mu) {
  const over15 = sumCells(cells, (c) => c.h + c.a >= 2);
  const over25 = sumCells(cells, (c) => c.h + c.a >= 3);
  const under25 = sumCells(cells, (c) => c.h + c.a <= 2);
  const btts = sumCells(cells, (c) => c.h > 0 && c.a > 0);
  const p1 = sumCells(cells, (c) => c.h > c.a);
  const p2 = sumCells(cells, (c) => c.h < c.a);
  const px = sumCells(cells, (c) => c.h === c.a);
  const p1x = p1 + px;
  const px2 = p2 + px;

  const dc1xO15 = sumCells(cells, (c) => c.h >= c.a && c.h + c.a >= 2);
  const dcX2O15 = sumCells(cells, (c) => c.h <= c.a && c.h + c.a >= 2);
  const dc1xO25 = sumCells(cells, (c) => c.h >= c.a && c.h + c.a >= 3);
  const dcX2O25 = sumCells(cells, (c) => c.h <= c.a && c.h + c.a >= 3);

  const expressPool = [
    packMarket("1X_O15", "1X + ТБ 1.5", dc1xO15, { risk: "dc_total", expressOk: true }),
    packMarket("X2_O15", "X2 + ТБ 1.5", dcX2O15, { risk: "dc_total", expressOk: true }),
    packMarket("1X_O25", "1X + ТБ 2.5", dc1xO25, { risk: "dc_total", expressOk: true }),
    packMarket("X2_O25", "X2 + ТБ 2.5", dcX2O25, { risk: "dc_total", expressOk: true }),
  ]
    .filter(Boolean)
    .filter((m) => m.prob >= 0.15 && m.odds >= 1.45 && m.odds <= 3.2);

  const totalsOnly = [
    packMarket("O15", "ТБ 1.5", over15, { risk: "total", expressOk: true }),
    packMarket("O25", "ТБ 2.5", over25, { risk: "total", expressOk: true }),
    packMarket("U25", "ТМ 2.5", under25, { risk: "total", expressOk: true }),
    packMarket("BTTS", "ОЗ — да", btts, { risk: "btts", expressOk: true }),
  ]
    .filter(Boolean)
    .filter((m) => m.prob >= 0.35 && m.odds >= 1.35 && m.odds <= 2.8);

  const p1Over = sumCells(cells, (c) => c.h > c.a && c.h + c.a >= 3);
  const p2Over = sumCells(cells, (c) => c.h < c.a && c.h + c.a >= 3);
  const bttsOver = sumCells(cells, (c) => c.h > 0 && c.a > 0 && c.h + c.a >= 3);
  const heavy = [
    packMarket("P1_O25", "П1 + ТБ 2.5", p1Over, { risk: "win_total", expressOk: false }),
    packMarket("P2_O25", "П2 + ТБ 2.5", p2Over, { risk: "win_total", expressOk: false }),
    packMarket("BTTS_O25", "ОЗ + ТБ 2.5", bttsOver, {
      risk: "btts_total",
      expressOk: false,
    }),
  ]
    .filter(Boolean)
    .filter((m) => m.prob >= 0.15 && m.odds >= 1.45 && m.odds <= 4.5);

  const expressCandidates = [...expressPool, ...totalsOnly].sort((a, b) => b.prob - a.prob);
  const bestExpress = expressCandidates[0] || null;
  const bestRisk =
    bestExpress ||
    [...heavy].sort((a, b) => b.prob - a.prob)[0] ||
    null;

  return {
    exactScores: [],
    combos: [...expressPool, ...totalsOnly, ...heavy],
    totalsMarkets: totalsOnly,
    expressCandidates,
    totals: {
      over15: round3(over15),
      over25: round3(over25),
      under25: round3(under25),
      btts: round3(btts),
      p1: round3(p1),
      p2: round3(p2),
      px: round3(px),
      p1x: round3(p1x),
      px2: round3(px2),
    },
    bestRisk,
    bestExpress,
    all: [...expressPool, ...totalsOnly, ...heavy],
  };
}

export function attachRiskToMatch(row, lambda, mu) {
  const cells = buildScoreMatrix(lambda, mu);
  const risk = computeRiskMarkets(cells, lambda, mu);
  return {
    ...row,
    risk,
    riskPick: risk.bestExpress || risk.bestRisk,
  };
}

function packExpress(legs, totalOdds, comboProb) {
  return {
    is_express: true,
    type: "high_risk",
    title: "РИСК-ЭКСПРЕСС",
    total_odds: round2(totalOdds),
    comboProb: round3(comboProb),
    oddsSource: "estimate",
    lottery: comboProb < 0.2,
    matches: legs.map(({ match, pick }) => ({
      home: match.home,
      away: match.away,
      kickoff: match.kickoff,
      league: match.league,
      market: pick.label,
      code: pick.code,
      odds: pick.odds,
      prob: pick.prob,
      risk: pick.risk,
    })),
  };
}

function tryBuildLegs(pool, n) {
  const used = new Set();
  const legs = [];
  for (const item of pool) {
    if (item.pick.prob < 0.15) continue;
    const teams = [item.match.home, item.match.away];
    if (teams.some((t) => used.has(t))) continue;
    legs.push(item);
    teams.forEach((t) => used.add(t));
    if (legs.length >= n) break;
  }
  if (legs.length < n) return null;

  let totalOdds = 1;
  let comboProb = 1;
  for (const l of legs) {
    totalOdds *= l.pick.odds;
    comboProb *= l.pick.prob;
  }
  if (totalOdds < 5 || totalOdds > 12) return null;
  return packExpress(legs, totalOdds, comboProb);
}

/**
 * Экспрессы: 2–4 ноги из 1X/X2+ТБ1.5, шанс каждой ноги ≥15%, кф 5–12.
 */
export function generateHighRiskExpress(matches) {
  const list = generateHighRiskExpressList(matches, 3);
  return list[0] || null;
}

export function generateHighRiskExpressList(matches, maxVariants = 3) {
  const pool = (matches || [])
    .filter((m) => m.model?.ok && m.risk?.expressCandidates?.length)
    .map((m) => {
      const pick = m.risk.expressCandidates.find((c) => c.prob >= 0.15) || null;
      return pick ? { match: m, pick } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.pick.prob - a.pick.prob);

  if (pool.length < 2) return [];

  const out = [];
  const seen = new Set();

  // Сначала пытаемся x2, x3, x4 на лучших; потом со сдвигом пула
  for (let shift = 0; shift < Math.min(4, pool.length) && out.length < maxVariants; shift++) {
    const shifted = [...pool.slice(shift), ...pool.slice(0, shift)];
    for (const n of [2, 3, 4]) {
      if (out.length >= maxVariants) break;
      const card = tryBuildLegs(shifted, n);
      if (!card) continue;
      const key = card.matches.map((m) => `${m.home}|${m.away}|${m.code}`).join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
  }

  out.sort((a, b) => b.comboProb - a.comboProb);
  return out.slice(0, maxVariants);
}
