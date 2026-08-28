/**
 * Математика ставок (аналог services/football_models.py).
 * Пуассон без scipy — чистый JS.
 */

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k, lambda) {
  if (!(lambda > 0)) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

/**
 * Матрица счетов 0:0 … maxGoals:maxGoals → П1/Х/П2 + ТБ/ТМ 2.5
 */
export function calculatePoissonProbability(
  homeAttack,
  homeDefense,
  awayAttack,
  awayDefense,
  opts = {},
) {
  const avgH = Number(opts.leagueAvgHome) > 0 ? Number(opts.leagueAvgHome) : 1.35;
  const avgA = Number(opts.leagueAvgAway) > 0 ? Number(opts.leagueAvgAway) : 1.15;
  const maxGoals = Number.isFinite(opts.maxGoals) ? opts.maxGoals : 5;

  let lambda = avgH * Math.max(0.05, homeAttack) * Math.max(0.05, awayDefense);
  let mu = avgA * Math.max(0.05, awayAttack) * Math.max(0.05, homeDefense);
  lambda = Math.max(0.05, Math.min(lambda, 5));
  mu = Math.max(0.05, Math.min(mu, 5));

  let p1 = 0;
  let px = 0;
  let p2 = 0;
  let over25 = 0;
  let under25 = 0;
  const matrix = [];

  for (let i = 0; i <= maxGoals; i++) {
    const row = [];
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, lambda) * poissonPmf(j, mu);
      row.push(Math.round(p * 1e8) / 1e8);
      if (i > j) p1 += p;
      else if (i === j) px += p;
      else p2 += p;
      if (i + j > 2.5) over25 += p;
      else under25 += p;
    }
    matrix.push(row);
  }

  const t = p1 + px + p2 || 1;
  return {
    matrix,
    lambda: Math.round(lambda * 1000) / 1000,
    mu: Math.round(mu * 1000) / 1000,
    p1: Math.round((p1 / t) * 10000) / 10000,
    px: Math.round((px / t) * 10000) / 10000,
    p2: Math.round((p2 / t) * 10000) / 10000,
    over25: Math.round(over25 * 10000) / 10000,
    under25: Math.round(under25 * 10000) / 10000,
  };
}

/**
 * Дробный Келли: f = fraction * (p*odds - 1) / (odds - 1)
 */
export function calculateKellyCriterion(
  trueProb,
  bkmOdds,
  bankroll = 100,
  fraction = 0.1,
) {
  const p = Number(trueProb);
  const o = Number(bkmOdds);
  const bank = Number(bankroll) > 0 ? Number(bankroll) : 100;
  const fr = Number(fraction) > 0 ? Number(fraction) : 0.1;

  if (!(p > 0) || !(o > 1.01)) {
    return { value: 0, kellyFull: 0, kellyFraction: 0, stake: 0, stakePct: 0 };
  }

  const value = Math.round((p * o - 1) * 10000) / 10000;
  const kellyFull = Math.max(0, (p * o - 1) / (o - 1));
  const kellyFraction = Math.min(0.25, kellyFull * fr);
  const stake = Math.round(bank * kellyFraction * 100) / 100;
  const stakePct = Math.round(kellyFraction * 10000) / 100;

  return {
    value,
    kellyFull: Math.round(kellyFull * 10000) / 10000,
    kellyFraction: Math.round(kellyFraction * 10000) / 10000,
    stake,
    stakePct,
  };
}

/** Приоритет по валую и размеру выборки (матчи сезона). */
export function priorityFromValue(value, sampleSize) {
  const v = Number(value) || 0;
  const n = Number(sampleSize) || 0;
  if (v > 0.05 && n > 8) return "HIGH";
  if (v > 0.05 && n <= 8) return "MEDIUM";
  if (v >= 0.01 && v <= 0.05) return "MEDIUM";
  if (v > 0) return "LOW";
  return "SKIP";
}
