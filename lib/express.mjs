/**
 * Сборщик короткого экспресса из сигналов (x2 / x3).
 */

function teamsOf(m) {
  return new Set([m.home, m.away]);
}

function overlaps(a, b) {
  for (const t of teamsOf(a)) if (teamsOf(b).has(t)) return true;
  return false;
}

function combo(legs) {
  let odds = 1;
  let prob = 1;
  for (const m of legs) {
    const r = m.recommendation;
    odds *= Number(r.odds) || 1;
    prob *= Number(r.prob) || 0;
  }
  return {
    legs: legs.map((m) => ({
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      pick: m.recommendation.label,
      code: m.recommendation.code,
      odds: m.recommendation.odds,
      prob: m.recommendation.prob,
      value: m.recommendation.value,
      thoughts: m.thoughts?.summary || "",
    })),
    comboOdds: Math.round(odds * 100) / 100,
    comboProb: Math.round(prob * 1000) / 1000,
    lottery: prob < 0.25,
  };
}

export function buildExpressCards(matches, { maxLegs = 3 } = {}) {
  const pool = (matches || []).filter((m) => m.isSignal || m.isTop);
  if (pool.length < 2) return [];

  const variants = [];

  // Лучший x2 и x3 по произведению вероятностей при кф в разумном коридоре
  for (let n = 2; n <= Math.min(maxLegs, pool.length); n++) {
    const idxs = [...Array(pool.length).keys()];
    // простой перебор C(n) ограниченный
    const pick = (start, chosen) => {
      if (chosen.length === n) {
        const c = combo(chosen);
        if (c.comboOdds >= 1.8 && c.comboOdds <= 8) variants.push(c);
        return;
      }
      for (let i = start; i < idxs.length; i++) {
        const m = pool[idxs[i]];
        if (chosen.some((x) => overlaps(x, m))) continue;
        pick(i + 1, [...chosen, m]);
      }
    };
    pick(0, []);
  }

  variants.sort((a, b) => b.comboProb - a.comboProb);
  // уникальные по набору матчей
  const seen = new Set();
  const out = [];
  for (const v of variants) {
    const key = v.legs.map((l) => `${l.home}|${l.away}|${l.pick}`).join(";");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}
