/**
 * Экспрессы ×10 / ×20 / ×30 + одинары по видам спорта (без LIVE).
 */

import { buildExpressAiReasoning } from "./expressAiReasoning.mjs";

const SPORTS = ["football", "tennis", "hockey", "basketball"];
const SPORT_LABEL = {
  football: "Футбол",
  tennis: "Теннис",
  hockey: "Хоккей",
  basketball: "Баскетбол",
};

const ODDS_MIN = 1.2;
const ODDS_MAX = 2.5;
/** Ниже порога предпочитаем комбо; короткие фавориты всё равно показываем. */
const MIN_SHOW_ODDS = 1.20;
/** Основная ставка в ленте — не короче этого кф. */
const MIN_MAIN_ODDS = 1.33;
const WEAK_SOURCES = new Set(["line_favorite", "live_score"]);
const STRONG_SOURCES = new Set([
  "profile",
  "4score_ai",
  "4score_h2h",
  "poisson",
  "model",
]);

function round2(x) {
  return Math.round(x * 100) / 100;
}
function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function estOdds(prob) {
  if (!prob || prob < 0.05) return 1.8;
  return round2(Math.min(8, Math.max(1.2, (1 / prob) * 0.92)));
}

function tierRank(t) {
  return t === "A" ? 3 : t === "B" ? 2 : 1;
}

function sourceBoost(src) {
  if (src === "profile") return 0.14;
  if (src === "4score_h2h") return 0.12;
  if (src === "4score_ai") return 0.1;
  if (src === "poisson" || src === "model") return 0.08;
  if (src === "line_favorite") return -0.04;
  return 0;
}

function legFromMatch(m, learnBoost = {}) {
  let best = null;

  const consider = (cand) => {
    if (!cand?.label) return;
    let odds = Number(cand.odds);
    if (!Number.isFinite(odds) || odds < 1.01) odds = estOdds(cand.prob);
    // для длинного купона поднимаем слишком низкий кф до пола коридора (оценка)
    if (odds < ODDS_MIN && (cand.prob || 0) >= 0.55) odds = ODDS_MIN;
    if (odds < ODDS_MIN || odds > ODDS_MAX) return;
    if ((cand.prob || 0) < 0.3 && !STRONG_SOURCES.has(cand.source)) return;

    const key = `${cand.family || "1x2"}|${cand.tier || "B"}`;
    const boost = learnBoost[key] || learnBoost[cand.family] || 0;
    // слегка предпочитаем ноги с кф ближе к 1.5–1.9 (рост суммы ×10–30)
    const oddsSweet = 1 - Math.abs(odds - 1.65) / 2;
    const score =
      (cand.prob || 0.4) +
      boost +
      sourceBoost(cand.source) +
      tierRank(cand.tier || "B") * 0.03 +
      oddsSweet * 0.04;

    if (!best || score > best._score) {
      best = {
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        league: m.league,
        sport: m.sport || "football",
        sportLabel: m.sportLabel || SPORT_LABEL[m.sport] || "Футбол",
        market: cand.label,
        code: cand.code || cand.label,
        odds: round2(odds),
        prob: cand.prob ?? 0.45,
        tier: cand.tier || "B",
        family: cand.family || "1x2",
        source: cand.source || null,
        _score: score,
      };
    }
  };

  if (m.aiPick) consider(m.aiPick);
  for (const o of m.outcomes || []) consider(o);
  if (m.recommendation) {
    consider({
      label: m.recommendation.label || m.recommendation.code,
      code: m.recommendation.code,
      prob: m.recommendation.prob,
      odds: m.recommendation.odds,
      tier: m.isTop ? "A" : "B",
      family: "1x2",
      source: "model",
    });
  }
  for (const c of m.risk?.combos || []) {
    consider({
      label: c.label,
      code: c.code,
      prob: c.prob,
      odds: c.odds,
      tier: c.prob >= 0.55 ? "B" : "C",
      family: "total",
      source: c.oddsSource || "estimate",
    });
  }

  if (!best) return null;
  delete best._score;
  return best;
}

function noOverlap(legs, next) {
  const used = new Set(legs.flatMap((l) => [l.home, l.away]));
  return !used.has(next.home) && !used.has(next.away);
}

function teamKey(l) {
  const home = typeof l === "string" ? l.split("|")[0] : l?.home;
  const away = typeof l === "string" ? l.split("|")[1] : l?.away;
  return `${String(home || "").trim()}|${String(away || "").trim()}`;
}

function normKey(k) {
  if (!k || typeof k !== "string") return teamKey(k);
  const [home = "", away = ""] = k.split("|");
  return `${home.trim()}|${away.trim()}`;
}

function diversify(pool, seq = ["1x2", "total", "1x2", "other", "total", "1x2"]) {
  const bags = { "1x2": [], total: [], other: [] };
  const ranked = [...pool].sort((a, b) => {
    const tr = tierRank(b.tier) - tierRank(a.tier);
    if (tr) return tr;
    return (b.prob || 0) - (a.prob || 0);
  });
  for (const p of ranked) {
    const f = p.family === "total" ? "total" : p.family === "1x2" ? "1x2" : "other";
    bags[f].push(p);
  }
  const out = [];
  let i = 0;
  while (out.length < pool.length && i < 2000) {
    const f = seq[i % seq.length];
    if (bags[f].length) out.push(bags[f].shift());
    i++;
  }
  // хвост, если какой-то мешок кончился раньше
  for (const f of ["1x2", "total", "other"]) {
    while (bags[f].length) out.push(bags[f].shift());
  }
  return out;
}

const SIZE_STYLE = {
  10: {
    seq: ["total", "1x2", "total", "other", "1x2"],
    title: "ЭКСПРЕСС ×10 · тоталы/1X",
  },
  20: {
    seq: ["1x2", "1x2", "total", "other", "1x2"],
    title: "ЭКСПРЕСС ×20 · исходы 1X2",
  },
  30: {
    seq: ["other", "total", "1x2", "total", "1x2", "other"],
    title: "ЭКСПРЕСС ×30 · микс",
  },
};

function buildSized(pool, n, { seq, title, excludeKeys = new Set() } = {}) {
  const filtered = (pool || []).filter((p) => !excludeKeys.has(teamKey(p)));
  const sorted = diversify(filtered, seq || SIZE_STYLE[n]?.seq);
  const legs = [];
  for (const item of sorted) {
    if (!noOverlap(legs, item)) continue;
    const cCount = legs.filter((l) => l.tier === "C").length;
    if (item.tier === "C" && cCount >= Math.max(2, Math.floor(n * 0.25))) continue;
    legs.push(item);
    if (legs.length >= n) break;
  }

  const need = Math.max(Math.ceil(n * 0.55), Math.min(n, 6));
  if (legs.length < need) return null;

  let guard = 0;
  while (guard++ < 40) {
    let totalOdds = 1;
    for (const l of legs) totalOdds *= Number(l.odds) || 1.5;
    const target = n >= 30 ? 250 : n >= 20 ? 80 : 20;
    if (totalOdds >= target * 0.85) break;

    let cheapestIdx = 0;
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].odds < legs[cheapestIdx].odds) cheapestIdx = i;
    }
    const cheap = legs[cheapestIdx];
    const replacement = sorted.find(
      (c) =>
        c.odds > cheap.odds + 0.08 &&
        noOverlap(
          legs.filter((_, i) => i !== cheapestIdx),
          c,
        ) &&
        !legs.some((l) => l.home === c.home && l.away === c.away),
    );
    if (!replacement) break;
    legs[cheapestIdx] = replacement;
  }

  let totalOdds = 1;
  let comboProb = 1;
  for (const l of legs) {
    totalOdds *= Number(l.odds) || 1.5;
    comboProb *= Number(l.prob) || 0.4;
  }

  return {
    is_express: true,
    size: legs.length,
    title: title || `ЭКСПРЕСС ×${legs.length}`,
    total_odds: round2(totalOdds),
    comboProb: round3(comboProb),
    riskNote:
      legs.length >= 15
        ? "Длинный экспресс: высокий риск, малая доля банка"
        : null,
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
      tier: l.tier,
      source: l.source,
    })),
  };
}

/**
 * Пул топ-ног для длинных экспрессов.
 */
function buildExpressPool(matches, learnBoost = {}) {
  const pool = [];
  for (const m of matches || []) {
    if (m.isLive) continue;
    const sport = m.sport || "football";
    if (!["football", "tennis", "hockey", "basketball"].includes(sport)) continue;
    const leg = legFromMatch(m, learnBoost);
    if (!leg) continue;
    pool.push(leg);
  }
  return pool;
}

/**
 * ×10 / ×20 / ×30 — разные составы: без общих пар команд между купонами,
 * плюс разный акцент исходов (тоталы / 1X2 / микс).
 */
export function buildExpressBySizes(matches, sizes = [10, 20, 30], learnBoost = {}) {
  const pool = buildExpressPool(matches, learnBoost);
  const usedPairs = new Set();
  const result = {};

  // сначала меньшие «топ»-купоны, чтобы ×10 брал лучших; ×20/×30 — другие матчи
  for (const n of sizes) {
    const style = SIZE_STYLE[n] || { seq: undefined, title: `ЭКСПРЕСС ×${n}` };
    let ex = buildSized(pool, n, {
      seq: style.seq,
      title: style.title,
      excludeKeys: usedPairs,
    });
    // если пул без пересечений мал — добираем, всё ещё избегая точных пар
    if (!ex) {
      ex = buildSized(pool, n, { seq: style.seq, title: style.title, excludeKeys: new Set() });
    }
    result[String(n)] = ex;
    if (ex?.matches) {
      for (const l of ex.matches) usedPairs.add(teamKey(l));
    }
  }
  return result;
}

function impliedFromOdds(odds) {
  if (!odds?.p1 && !odds?.p2) return null;
  const entries = [
    { label: "П1", code: "П1", odds: odds.p1 },
    { label: "Х", code: "Х", odds: odds.x },
    { label: "П2", code: "П2", odds: odds.p2 },
  ].filter((e) => e.odds && e.odds > 1.01);
  if (!entries.length) return null;
  entries.sort((a, b) => a.odds - b.odds);
  const best = entries[0];
  const invSum = entries.reduce((s, e) => s + 1 / e.odds, 0);
  const prob = invSum > 0 ? (1 / best.odds) / invSum : 0.4;
  if (best.odds > 2.35 || prob < 0.42) return null;
  return {
    label: best.label,
    code: best.code,
    prob: Math.round(prob * 1000) / 1000,
    odds: best.odds,
    tier: prob >= 0.55 ? "B" : "C",
    family: "1x2",
    source: "line_favorite",
  };
}

/** Строки фактов «N из M» (без формы — форма отдельно). */
function factLinesCore(name, facts) {
  if (!facts || !name) return [];
  const out = [];
  const venueRu =
    facts.venue === "home" ? "дома" : facts.venue === "away" ? "в гостях" : "";
  if (facts.btts >= 3 && facts.bttsPct >= 55) {
    out.push(
      venueRu
        ? `${name}: обе забивали в ${facts.btts} из ${facts.n} последних ${venueRu} (${facts.bttsPct}%)`
        : `${name}: обе забивали в ${facts.btts} из ${facts.n} последних матчей (${facts.bttsPct}%)`,
    );
  }
  if (facts.scored >= 3) {
    out.push(
      `${name} забивал(а) в ${facts.scored} из ${facts.n} последних${venueRu ? ` ${venueRu}` : ""}`,
    );
  }
  if (facts.scoreStreak >= 3) {
    out.push(`${name} забивает в ${facts.scoreStreak} матчах кряду`);
  }
  if (facts.conceded >= 3 && facts.conceded / facts.n >= 0.6) {
    out.push(`${name} пропускал(а) в ${facts.conceded} из ${facts.n} последних`);
  }
  if (facts.over25 >= 3 && facts.over25Pct >= 55) {
    out.push(
      `Тотал больше 2.5 был в ${facts.over25} из ${facts.n} матчей с участием ${name} (${facts.over25Pct}%)`,
    );
  }
  return out;
}

/** Факты N из M по счетам очных (4score H2H). */
function h2hFactLines(home, away, h2h) {
  if (!h2h?.scores?.length) return [];
  const parsed = [];
  for (const s of h2h.scores) {
    const m = String(s).match(/(\d+)\s*[:\-]\s*(\d+)/);
    if (!m) continue;
    parsed.push({ hg: Number(m[1]), ag: Number(m[2]) });
  }
  if (parsed.length < 2) return [];
  const n = parsed.length;
  let btts = 0;
  let over25 = 0;
  let homeScored = 0;
  let awayScored = 0;
  for (const p of parsed) {
    if (p.hg > 0 && p.ag > 0) btts++;
    if (p.hg + p.ag > 2.5) over25++;
    if (p.hg > 0) homeScored++;
    if (p.ag > 0) awayScored++;
  }
  const scope = h2h.scopeLabel || "в очных";
  const out = [];
  if (btts >= 2 && btts / n >= 0.5) {
    out.push(`Обе забивали в ${btts} из ${n} очных (${scope})`);
  }
  if (over25 >= 2 && over25 / n >= 0.5) {
    out.push(`Тотал больше 2.5 в ${over25} из ${n} очных`);
  }
  if (homeScored >= 2) {
    out.push(`${home} забивал(а) в ${homeScored} из ${n} очных`);
  }
  if (awayScored >= 2) {
    out.push(`${away} забивал(а) в ${awayScored} из ${n} очных`);
  }
  return out;
}

/**
 * Компиляция «Почему» — факты N из M, без кэфов и без противоречий.
 */
function buildAiComment(m, main, combo = null, _dilutedFrom = null) {
  const home = m.home || "П1";
  const away = m.away || "П2";
  const lines = [];

  const homeVenue = m.model?.factsHomeVenue || m.factsHomeVenue;
  const awayVenue = m.model?.factsAwayVenue || m.factsAwayVenue;
  const homeAny = m.model?.factsHome || m.factsHome;
  const awayAny = m.model?.factsAway || m.factsAway;

  let homeLines = factLinesCore(home, homeVenue);
  if (!homeLines.length) homeLines = factLinesCore(home, homeAny);
  let awayLines = factLinesCore(away, awayVenue);
  if (!awayLines.length) awayLines = factLinesCore(away, awayAny);

  lines.push(...homeLines.slice(0, 2));
  lines.push(...awayLines.slice(0, 2));

  if (lines.length < 2) {
    if (homeAny?.n >= 5) {
      lines.push(
        `Форма ${home}: ${homeAny.wins}П-${homeAny.draws}Н-${homeAny.losses}Пр за ${homeAny.n} (${homeAny.winPct}% побед)`,
      );
    }
    if (awayAny?.n >= 5) {
      lines.push(
        `Форма ${away}: ${awayAny.wins}П-${awayAny.draws}Н-${awayAny.losses}Пр за ${awayAny.n} (${awayAny.winPct}% побед)`,
      );
    }
  }

  const h2h = m.h2h;
  if (h2h?.n >= 2) {
    // сначала числа по счетам (как на скрине), потом итог серии
    if (lines.length < 4) {
      lines.push(...h2hFactLines(home, away, h2h).slice(0, 3));
    }
    const score = `${h2h.homeWins}–${h2h.draws}–${h2h.awayWins}`;
    if (h2h.lean === "home" || h2h.lean === "home_soft") {
      lines.push(`Очные: чаще брал ${home} (${score})`);
    } else if (h2h.lean === "away" || h2h.lean === "away_soft") {
      lines.push(`Очные: чаще брал ${away} (${score})`);
    } else {
      lines.push(`Очные встречи: ${score}`);
    }
  }

  // одна серия «забивает кряду» — без 9 и 10 рядом
  const deduped = [];
  let bestScoreStreak = null;
  for (const line of lines) {
    const mSt = line.match(/^(.+) забивает в (\d+) матчах кряду$/);
    if (mSt) {
      const n = Number(mSt[2]);
      if (!bestScoreStreak || n > bestScoreStreak.n) {
        bestScoreStreak = { line, n };
      }
      continue;
    }
    deduped.push(line);
  }
  if (bestScoreStreak) deduped.push(bestScoreStreak.line);

  const unique = [...new Set(deduped)].slice(0, 6);
  if (!unique.length) {
    return "Мало отдельных фактов по этому матчу — ориентир по линии.";
  }
  return unique.join("\n");
}

function valueEdgeSafe(prob, odds) {
  const p = Number(prob);
  const o = Number(odds);
  if (!(p > 0) || !(o > 1.01)) return null;
  return Math.round((p * o - 1) * 1000) / 1000;
}

/** Комбо/тотал к основному исходу — чтобы поднять кф в БК. */
function pickComboForMain(m, main, { minOdds = MIN_SHOW_ODDS } = {}) {
  const combos = m.risk?.combos || [];
  if (!combos.length || !main) return null;

  const code = String(main.code || main.label || "");
  const prefer = [];
  if (code === "П1" || code === "1") prefer.push("P1_O25", "1X_O25", "1X_O15", "O25", "O15", "BTTS");
  else if (code === "П2" || code === "2") prefer.push("P2_O25", "X2_O25", "X2_O15", "O25", "O15", "BTTS");
  else if (code === "1X") prefer.push("1X_O25", "1X_O15", "O25", "BTTS");
  else if (code === "X2") prefer.push("X2_O25", "X2_O15", "O25", "BTTS");
  else if (code === "BTTS" || code === "ОЗ") prefer.push("BTTS_O25", "1X_O25", "O25", "P1_O25");
  else if (code === "O25" || /ТБ\s*2\.5/i.test(code)) prefer.push("1X_O25", "P1_O25", "BTTS_O25", "O25");
  else if (code === "Х" || code === "X") prefer.push("U25", "O15", "O25");
  else prefer.push("1X_O25", "O25", "O15", "BTTS", "1X_O15");

  const pack = (hit) =>
    hit?.label
      ? {
          label: hit.label,
          code: hit.code,
          prob: hit.prob,
          odds: hit.odds,
          oddsSource: hit.oddsSource || "estimate",
        }
      : null;

  for (const id of prefer) {
    const hit = combos.find(
      (c) =>
        c.code === id &&
        (c.prob || 0) >= 0.18 &&
        Number(c.odds) >= minOdds,
    );
    const p = pack(hit);
    if (p) return p;
  }

  const mainOdds = Number(main.odds) || 1.01;
  const fallback = [...combos]
    .filter(
      (c) =>
        c.label &&
        Number(c.odds) >= minOdds &&
        Number(c.odds) > mainOdds + 0.08 &&
        (c.prob || 0) >= 0.18,
    )
    .sort((a, b) => (b.prob || 0) - (a.prob || 0))[0];
  return pack(fallback);
}

function isPlainOutcome(p) {
  if (!p?.label) return false;
  if (p.family === "total") return false;
  const s = String(p.label);
  return !s.includes("+") && !/^Т[БМ]\b/i.test(s) && !/^ОЗ/i.test(s);
}

function isTotalOrBtts(p) {
  if (!p) return false;
  if (p.family === "total") return true;
  const s = String(p.code || p.label || "");
  return /BTTS|^ОЗ|ОЗ\s*—|^O\d|^U\d|ТБ|ТМ/i.test(s);
}

function rowFromMatch(m, learnBoost = {}) {
  if (m.isLive) return null;
  const sport = m.sport || "football";
  if (!SPORTS.includes(sport)) return null;

  const picks = [];
  const add = (p) => {
    if (!p?.label) return;
    if (picks.some((x) => x.label === p.label)) return;
    const key = `${p.family || "1x2"}|${p.tier || "B"}`;
    const boost = learnBoost[key] || learnBoost[p.family] || 0;
    const plainBonus = isPlainOutcome(p) ? 0.12 : 0;
    const totalPenalty = isTotalOrBtts(p) ? -0.35 : 0;
    picks.push({
      ...p,
      _score:
        (p.prob || 0.4) +
        boost +
        sourceBoost(p.source) +
        tierRank(p.tier || "B") * 0.02 +
        plainBonus +
        totalPenalty,
    });
  };

  add(m.aiPick);
  if (m.profilePick?.main || m.profilePick?.label) {
    const pm = m.profilePick.main || m.profilePick;
    add({
      label: pm.label,
      code: pm.code,
      prob: pm.prob,
      odds: pm.odds || estOdds(pm.prob),
      tier: pm.tier || m.profilePick.tier || "B",
      family: pm.family || "1x2",
      source: "profile",
      isTop: pm.tier === "A" || m.profilePick.tier === "A",
    });
  }
  for (const o of m.outcomes || []) add(o);
  if (m.recommendation) {
    add({
      label: m.recommendation.label,
      code: m.recommendation.code,
      prob: m.recommendation.prob,
      odds: m.recommendation.odds,
      value: m.recommendation.value,
      tier: m.isTop ? "A" : "B",
      family: "1x2",
      source: "model",
    });
  }
  if (!picks.length) add(impliedFromOdds(m.odds));
  if (!picks.length) return null;

  picks.sort((a, b) => b._score - a._score);
  // Главное — исход (П1/X/П2/1X/X2). ОЗ/ТБ не в main, если есть исход.
  let main =
    picks.find((p) => p.source === "profile" && isPlainOutcome(p) && !isTotalOrBtts(p)) ||
    picks.find((p) => isPlainOutcome(p) && !isTotalOrBtts(p)) ||
    picks.find((p) => p.source === "profile") ||
    picks[0];
  if (isTotalOrBtts(main)) {
    const outcome = picks.find((p) => isPlainOutcome(p) && !isTotalOrBtts(p));
    if (outcome) main = outcome;
  }
  if (main.source === "line_favorite" && picks.some((p) => STRONG_SOURCES.has(p.source))) {
    main =
      picks.find((p) => STRONG_SOURCES.has(p.source) && isPlainOutcome(p) && !isTotalOrBtts(p)) ||
      picks.find((p) => STRONG_SOURCES.has(p.source) && isPlainOutcome(p)) ||
      picks.find((p) => STRONG_SOURCES.has(p.source)) ||
      main;
  }

  let value = main.value != null ? main.value : valueEdgeSafe(main.prob, main.odds);
  let isTop = Boolean(main.isTop) || (value != null && value > 0.08);
  let aiPick = {
    label: main.label,
    code: main.code,
    prob: main.prob,
    odds: main.odds,
    value,
    tier: isTop ? "A" : main.tier,
    family: main.family || "1x2",
    source: main.source,
    isTop,
  };

  let combo = pickComboForMain(m, aiPick, { minOdds: MIN_MAIN_ODDS });
  let dilutedFrom = null;

  // Мелкий кф основной (< 1.33) → следующий / комбо
  if (!(Number(aiPick.odds) >= MIN_MAIN_ODDS)) {
    const nextOk = picks.find(
      (p) =>
        p.label !== aiPick.label &&
        Number(p.odds) >= MIN_MAIN_ODDS &&
        (p.source === "profile" || STRONG_SOURCES.has(p.source) || isPlainOutcome(p)),
    );
    const boost =
      nextOk ||
      combo ||
      pickComboForMain(m, aiPick, { minOdds: MIN_MAIN_ODDS });
    if (boost && Number(boost.odds) >= MIN_MAIN_ODDS) {
      dilutedFrom = `${aiPick.label}${aiPick.odds != null ? ` @ ${Number(aiPick.odds).toFixed(2)}` : ""}`;
      value = valueEdgeSafe(boost.prob, boost.odds);
      isTop = value != null && value > 0.08;
      aiPick = {
        label: boost.label,
        code: boost.code,
        prob: boost.prob,
        odds: boost.odds,
        value,
        tier: isTop ? "A" : boost.tier || "B",
        family: boost.family || (String(boost.label).includes("+") ? "combo" : "1x2"),
        source: boost.source || boost.oddsSource || "estimate",
        isTop,
        dilutedFrom,
      };
      combo = pickComboForMain(
        m,
        { label: aiPick.label, code: aiPick.code, odds: aiPick.odds },
        { minOdds: Math.max(MIN_MAIN_ODDS, Number(aiPick.odds) + 0.1) },
      );
    }
  }

  // нет валидного кф — мимо
  if (!(Number(aiPick.odds) > 1.01)) return null;
  // слишком короткий фаворит без нормального кф — не в ленту
  if (!(Number(aiPick.odds) >= MIN_MAIN_ODDS)) return null;

  const alts = [];
  if (combo && Number(combo.odds) >= MIN_SHOW_ODDS) {
    alts.push({
      label: combo.label,
      code: combo.code,
      prob: combo.prob,
      tier: "B",
      odds: combo.odds,
      kind: "combo",
    });
  }
  for (const p of picks) {
    if (p.label === aiPick.label) continue;
    if (combo && (p.label === combo.label || p.code === combo.code)) continue;
    if (Number(p.odds) > 0 && Number(p.odds) < MIN_SHOW_ODDS) continue;
    alts.push({
      label: p.label,
      code: p.code,
      prob: p.prob,
      tier: p.tier,
      odds: p.odds,
    });
    if (alts.length >= 4) break;
  }

  // доп. из профиля (2-я и 3-я степень)
  if (m.profilePick?.extras?.length) {
    for (const ex of m.profilePick.extras) {
      if (!ex?.label || ex.label === aiPick.label) continue;
      if (alts.some((a) => a.label === ex.label || a.code === ex.code)) continue;
      alts.push({
        label: ex.label,
        code: ex.code,
        prob: ex.prob,
        tier: ex.tier || "B",
        odds: ex.odds || estOdds(ex.prob),
        kind: "extra",
      });
    }
  }

  return {
    home: m.home,
    away: m.away,
    kickoff: m.kickoff,
    league: m.league || "",
    sport,
    sportLabel: m.sportLabel || SPORT_LABEL[sport] || "Спорт",
    aiPick,
    combo: combo && Number(combo.odds) >= MIN_SHOW_ODDS ? combo : null,
    alts,
    why: m.why || null,
    h2h: m.h2h || null,
    comment:
      (m.profilePick?.why?.length
        ? m.profilePick.why.join("\n")
        : null) ||
      (m.fourscoreFacts?.length
        ? m.fourscoreFacts.slice(0, 3).join("\n")
        : null) ||
      buildAiComment(m, aiPick, combo, dilutedFrom),
    isTop: isTop || m.isTop,
    odds: m.odds,
    modelOk: Boolean(m.model?.ok),
    homeProfile: slimProfile(m.homeProfile),
    awayProfile: slimProfile(m.awayProfile),
    profilePick: m.profilePick
      ? {
          label: m.profilePick.label,
          code: m.profilePick.code,
          why: m.profilePick.why || [],
          main: m.profilePick.main
            ? {
                label: m.profilePick.main.label,
                code: m.profilePick.main.code,
                odds: m.profilePick.main.odds,
                reason: m.profilePick.main.reason,
              }
            : null,
          extras: (m.profilePick.extras || []).map((ex) => ({
            label: ex.label,
            code: ex.code,
            odds: ex.odds,
            reason: ex.reason,
          })),
        }
      : null,
    fourscoreFacts: pickUsefulFacts(m.fourscoreFacts, 4),
    h2hSlim: slimH2h(m.h2h),
    xg: m.xg || null,
    expectedGoals: slimExpectedGoals(m),
    extraStats: m.extraStats || null,
    motivation: slimMotivation(m),
  };
}

/** λ/μ модели или null. */
function slimExpectedGoals(m) {
  const lam = m.model?.lambda;
  const mu = m.model?.mu;
  if (m.model?.ok && Number.isFinite(Number(lam)) && Number.isFinite(Number(mu))) {
    return {
      home: Number(lam),
      away: Number(mu),
      source: "poisson",
    };
  }
  return null;
}

/**
 * Факты 4score про тотал голов: интересны только пороги «как линии» 1.5–3.5.
 * «не меньше 1» / «не более 5» — почти всегда правда, в мотив не берём.
 */
export function isUsefulGoalFact(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;

  const aboutTotal =
    /суммарно\s+забив/i.test(t) ||
    (/тотал/i.test(t) && /гол/i.test(t));

  if (aboutTotal) {
    const minM = t.match(/не\s+меньше\s+(\d+(?:[.,]\d+)?)/i);
    if (minM) {
      const n = Number(String(minM[1]).replace(",", "."));
      // ≥2 и ≤4 ≈ ТБ 1.5 … ТБ 3.5
      return Number.isFinite(n) && n >= 2 && n <= 4;
    }
    const maxM = t.match(/не\s+более\s+(\d+(?:[.,]\d+)?)/i);
    if (maxM) {
      const n = Number(String(maxM[1]).replace(",", "."));
      // ≤3 ≈ ТМ 3.5 и ниже; «не более 4/5» слишком широко
      return Number.isFinite(n) && n >= 1.5 && n <= 3;
    }
    return false;
  }

  // ИТ команды: «забивает не более 2» — ок; «не меньше 1» — нет
  if (/забива/i.test(t) && /гол/i.test(t)) {
    const minM = t.match(/не\s+меньше\s+(\d+(?:[.,]\d+)?)/i);
    if (minM) {
      const n = Number(String(minM[1]).replace(",", "."));
      return Number.isFinite(n) && n >= 2 && n <= 3;
    }
    const maxM = t.match(/не\s+более\s+(\d+(?:[.,]\d+)?)/i);
    if (maxM) {
      const n = Number(String(maxM[1]).replace(",", "."));
      return Number.isFinite(n) && n >= 1 && n <= 3;
    }
  }

  return false;
}

function pickUsefulFacts(facts, limit = 4) {
  const list = (facts || []).map((t) => String(t || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const useful = list.filter(isUsefulGoalFact);
  return useful.slice(0, limit);
}

/** Мотив/факт из уже имеющихся данных. */
function slimMotivation(m) {
  if (m.motivation?.text) {
    const t = String(m.motivation.text).trim();
    if (isUsefulGoalFact(t) || !/гол/i.test(t)) {
      return { text: t, source: m.motivation.source || "manual" };
    }
  }
  const useful = pickUsefulFacts(m.fourscoreFacts, 1);
  if (useful[0]) return { text: useful[0], source: "4score_fact" };

  const fa = m.awayProfile?.form || [];
  const fh = m.homeProfile?.form || [];
  if (fa.length >= 4 && fa.every((x) => x === "L")) {
    return {
      text: `У «${m.away}» серия из ${fa.length} поражений подряд.`,
      source: "form",
    };
  }
  if (fh.length >= 4 && fh.every((x) => x === "W")) {
    return {
      text: `У «${m.home}» серия из ${fh.length} побед подряд.`,
      source: "form",
    };
  }
  return null;
}

function slimH2h(h) {
  if (!h || !(h.n > 0)) return null;
  return {
    n: h.n,
    homeWins: h.homeWins ?? 0,
    draws: h.draws ?? 0,
    awayWins: h.awayWins ?? 0,
    scopeLabel: h.scopeLabel || "",
    scores: (h.scores || []).slice(0, 5),
    leanSide: h.leanSide || null,
  };
}

function slimProfile(p) {
  if (!p?.betTable) return null;
  let form = Array.isArray(p.form) ? p.form.filter((x) => x === "W" || x === "D" || x === "L") : [];
  if (!form.length && p.games?.length) {
    form = p.games.slice(-5).map((g) => (g.gf > g.ga ? "W" : g.gf < g.ga ? "L" : "D"));
  }
  return {
    name: p.name,
    n: p.n,
    venue: p.venue,
    summary: p.summary,
    form,
    betTable: {
      itb05: p.betTable.itb05,
      itb15: p.betTable.itb15,
      btts: p.betTable.btts,
      over25: p.betTable.over25,
      win: p.betTable.win,
      draw: p.betTable.draw,
      loss: p.betTable.loss,
    },
  };
}

export function buildSinglesFeed(matches, limit = 2000, learnBoost = {}) {
  const out = [];
  for (const m of matches || []) {
    const row = rowFromMatch(m, learnBoost);
    if (row) out.push(row);
  }
  out.sort((a, b) => {
    const tr = tierRank(b.aiPick?.tier) - tierRank(a.aiPick?.tier);
    if (tr) return tr;
    return (b.aiPick?.prob || 0) - (a.aiPick?.prob || 0);
  });
  return out.slice(0, limit);
}

export function buildSinglesBySport(matches, perSport = 9999, learnBoost = {}) {
  const all = buildSinglesFeed(matches, Math.max(perSport * 4, 2000), learnBoost);
  const by = {
    football: [],
    tennis: [],
    hockey: [],
    basketball: [],
  };
  for (const row of all) {
    const s = row.sport;
    if (!by[s]) continue;
    // только A в основной ленте
    if ((row.aiPick?.tier || "B") !== "A") continue;
    if (by[s].length >= perSport) continue;
    by[s].push(row);
  }
  return by;
}

/** B/C и без разбора — вкладка разработчика. */
export function buildSinglesArchiveBySport(matches, perSport = 9999, learnBoost = {}) {
  const all = buildSinglesFeed(matches, Math.max(perSport * 4, 2000), learnBoost);
  const by = {
    football: [],
    tennis: [],
    hockey: [],
    basketball: [],
  };
  for (const row of all) {
    const s = row.sport;
    if (!by[s]) continue;
    const tier = row.aiPick?.tier || "C";
    if (tier === "A") continue;
    if (by[s].length >= perSport) continue;
    by[s].push({
      ...row,
      archiveReason: !row.homeProfile
        ? "нет профиля/статы"
        : tier === "B"
          ? "средний сигнал (B)"
          : "слабый сигнал (C)",
      debug: {
        source: row.aiPick?.source || null,
        modelOk: row.modelOk,
        hasProfile: Boolean(row.homeProfile && row.awayProfile),
        tier,
      },
    });
  }
  return by;
}

/** LIVE-матчи для вкладки + сигналы прогрузки отдельно. */
export function buildLiveFeed(matches) {
  return (matches || [])
    .filter((m) => m.isLive)
    .map((m) => ({
      home: m.home,
      away: m.away,
      league: m.league,
      sport: m.sport || "football",
      sportLabel: m.sportLabel || "Футбол",
      minute: m.minute,
      statusText: m.statusText,
      score: m.score,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      aiPick: m.aiPick,
      why: m.why || null,
      h2h: m.h2h || null,
      odds: m.odds,
      alts: (m.outcomes || []).slice(0, 3).map((o) => ({
        label: o.label,
        tier: o.tier,
        prob: o.prob,
      })),
    }));
}

const CAPPER_PROFILES = {
  safe: {
    id: "safe",
    legs: 3,
    title: "Уверенный",
    subtitle: "3 одинара A · самый высокий шанс",
    outcomesOnly: true,
    minProb: 0.5,
    oddsMin: 1.33,
    oddsMax: 2.45,
    maxTierC: 0,
    minTierA: 3,
    targetMin: 3.2,
    targetMax: 8,
  },
  medium: {
    id: "medium",
    legs: 4,
    title: "Средний",
    subtitle: "4 одинара A · кф заметно выше",
    outcomesOnly: true,
    minProb: 0.44,
    oddsMin: 1.45,
    oddsMax: 2.35,
    maxTierC: 0,
    minTierA: 4,
    targetMin: 12,
    targetMax: 28,
  },
  risky: {
    id: "risky",
    legs: 5,
    title: "Рискованный",
    subtitle: "5 одинаров A · максимальный кф",
    outcomesOnly: true,
    minProb: 0.38,
    oddsMin: 1.55,
    oddsMax: 2.65,
    maxTierC: 0,
    minTierA: 5,
    targetMin: 35,
    targetMax: 150,
  },
};

function capperLegFromSingle(row, profile) {
  if ((row.aiPick?.tier || "B") !== "A") return null;

  const pick = row.aiPick;
  if (!pick?.label) return null;
  if (profile.outcomesOnly && !isPlainOutcome(pick)) return null;

  let prob = Number(pick.prob);
  if (!Number.isFinite(prob) || prob <= 0) {
    const o = Number(pick.odds);
    prob = Number.isFinite(o) && o > 1 ? Math.min(0.85, 1 / o) : 0.5;
  }
  if (prob < profile.minProb) return null;

  let odds = Number(pick.odds);
  if (!Number.isFinite(odds) || odds < 1.01) odds = estOdds(prob);
  if (odds < profile.oddsMin || odds > profile.oddsMax) return null;

  const score =
    prob +
    tierRank("A") * 0.1 +
    0.08 +
    sourceBoost(pick.source) +
    (row.sport === "football" ? 0.04 : 0);

  const reason =
    row.profilePick?.main?.reason?.split(".")[0] ||
    pick.reason?.split(".")[0] ||
    `${pick.label} — одинар A из ленты`;

  return {
    home: row.home,
    away: row.away,
    kickoff: row.kickoff,
    league: row.league || "",
    sport: row.sport || "football",
    sportLabel: row.sportLabel || SPORT_LABEL[row.sport] || "Футбол",
    market: pick.label,
    pick: pick.label,
    code: pick.code || pick.label,
    odds: round2(odds),
    prob,
    tier: "A",
    family: "1x2",
    source: pick.source,
    reason,
    _score: score,
  };
}

function capperLegFromMatch(m, profile, learnBoost = {}) {
  if (m.isLive) return null;

  const pick = m.profilePick?.main || m.aiPick || m.recommendation;
  if (!pick?.label) {
    const leg = legFromMatch(m, learnBoost);
    if (!leg) return null;
    if (profile.outcomesOnly && leg.family !== "1x2") return null;
    const tier = leg.tier || "B";
    if (tier === "C" && profile.maxTierC === 0) return null;
    const prob = Number(leg.prob) || 0;
    if (prob < profile.minProb) return null;
    const odds = Number(leg.odds);
    if (!Number.isFinite(odds) || odds < profile.oddsMin || odds > profile.oddsMax) {
      return null;
    }
    return {
      ...leg,
      pick: leg.market,
      reason: m.profilePick?.main?.reason?.split(".")[0] || "",
      _score: prob + tierRank(tier) * 0.08,
    };
  }

  return capperLegFromSingle(
    {
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      sport: m.sport,
      sportLabel: m.sportLabel,
      aiPick: m.aiPick,
      profilePick: m.profilePick,
    },
    profile,
  );
}

function buildCapperPool(profile, singlesRows = []) {
  const pool = [];
  const seen = new Set();

  const push = (leg) => {
    if (!leg) return;
    const key = teamKey(leg);
    if (seen.has(key)) return;
    seen.add(key);
    pool.push(leg);
  };

  const singles = (singlesRows || []).filter((r) => r?.aiPick?.label && r.aiPick.tier === "A");
  singles.sort((a, b) => {
    return (b.aiPick?.prob || 0) - (a.aiPick?.prob || 0);
  });

  for (const row of singles) {
    push(capperLegFromSingle(row, profile));
  }

  return pool;
}

function productOdds(legs) {
  return legs.reduce((p, l) => p * (Number(l.odds) || 1.4), 1);
}

function pickCapperLegs(pool, profile, excludeKeys = new Set(), rotateSkip = 0) {
  const sorted = [...pool].sort((a, b) => b._score - a._score);
  const eligible = sorted.filter((item) => !excludeKeys.has(teamKey(item)));
  if (eligible.length < profile.legs) return null;
  const rot = Math.abs(rotateSkip) % eligible.length;
  const rotated = [...eligible.slice(rot), ...eligible.slice(0, rot)];
  const legs = [];
  let cCount = 0;

  for (const item of rotated) {
    if (excludeKeys.has(teamKey(item))) continue;
    if (!noOverlap(legs, item)) continue;
    if (item.tier === "C") {
      if (cCount >= profile.maxTierC) continue;
      cCount++;
    }
    legs.push(item);
    if (legs.length >= profile.legs) break;
  }

  if (legs.length < profile.legs) return null;

  const tierACount = legs.filter((l) => l.tier === "A").length;
  if ((profile.minTierA || 0) > 0 && tierACount < profile.minTierA) return null;

  const targetMin = profile.targetMin || 3;
  let guard = 0;
  while (guard++ < 60 && productOdds(legs) < targetMin) {
    let minIdx = 0;
    for (let i = 1; i < legs.length; i++) {
      if (Number(legs[i].odds) < Number(legs[minIdx].odds)) minIdx = i;
    }
    const cur = legs[minIdx];
    const better = rotated.find(
      (c) =>
        c !== cur &&
        !legs.includes(c) &&
        Number(c.odds) > Number(cur.odds) + 0.03 &&
        Number(c.odds) <= profile.oddsMax &&
        (Number(c.prob) || 0) >= profile.minProb - 0.04 &&
        noOverlap(
          legs.filter((_, i) => i !== minIdx),
          c,
        ) &&
        !excludeKeys.has(teamKey(c)),
    );
    if (!better) break;
    legs[minIdx] = better;
  }

  return legs;
}

function buildCapperRecommendation(legs, profile, totalOdds) {
  const lines = legs.map((l) => `${l.home} — ${l.away}: ${l.pick}`);
  const kf = round2(totalOdds);
  if (profile.id === "safe") {
    return `Рекомендую начать с этого купона (только одинары A) — ${lines.join("; ")}. Самый высокий шанс зайти, кф ×${kf}.`;
  }
  if (profile.id === "medium") {
    return `Средний по риску, только A: ${lines.slice(0, 2).join("; ")}${lines.length > 2 ? ` и ещё ${lines.length - 2} матча` : ""}. Кф ×${kf} — заметно выше уверенного.`;
  }
  return `Рискованный вариант из одинаров A — пять исходов. Кф ×${kf}: реже заходит, но выигрыш крупнее. ${lines[0] || ""}${lines.length > 1 ? " и др." : ""}`;
}

function buildCapperSummary(legs, profile, totalOdds) {
  return buildCapperRecommendation(legs, profile, totalOdds);
}

function buildCapperCoupon(pool, profile, singlesRows, excludeKeys = new Set(), rotateSkip = 0) {
  const legs = pickCapperLegs(pool, profile, excludeKeys, rotateSkip);
  if (!legs || !legs.every((l) => l.tier === "A")) return null;

  const totalOdds = productOdds(legs);
  let comboProb = 1;
  for (const l of legs) comboProb *= Number(l.prob) || 0.45;

  const recommendation = buildCapperRecommendation(legs, profile, totalOdds);
  const summary = recommendation;
  const { aiTitle, aiReasoning } = buildExpressAiReasoning(legs, singlesRows, profile);

  return {
    id: profile.id,
    title: profile.title,
    subtitle: profile.subtitle,
    is_express: true,
    size: legs.length,
    total_odds: round2(totalOdds),
    comboProb: round3(comboProb),
    summary,
    recommendation,
    aiTitle,
    aiReasoning,
    matches: legs.map(({ _score, ...l }) => l),
  };
}

/**
 * Купоны капера: уверенный ×3 / средний ×4 / рискованный ×5.
 * Только ноги из одинаров тира A (singlesRows).
 */
function buildCapperForLevel(key, singlesRows, usedPairs) {
  const base = CAPPER_PROFILES[key];
  if (!base) return null;

  const profiles =
    key === "safe"
      ? [
          base,
          { ...base, oddsMax: 2.65, minProb: 0.46, targetMin: 3.0 },
          {
            ...base,
            outcomesOnly: false,
            oddsMax: 2.85,
            minProb: 0.42,
            targetMin: 2.8,
            oddsMin: 1.3,
          },
        ]
      : [base];

  for (const profile of profiles) {
    const pool = buildCapperPool(profile, singlesRows);
    let coupon = buildCapperCoupon(pool, profile, singlesRows, usedPairs);
    if (!coupon) coupon = buildCapperCoupon(pool, profile, singlesRows, new Set());
    if (coupon) return coupon;
  }

  return rebuildCapperLevel(key, singlesRows, [...usedPairs]);
}

export function buildCapperExpresses(_matches, learnBoost = {}, singlesRows = []) {
  const usedPairs = new Set();
  const out = {};

  for (const key of Object.keys(CAPPER_PROFILES)) {
    const coupon = buildCapperForLevel(key, singlesRows, usedPairs);
    out[key] = coupon;
    if (coupon?.matches) {
      for (const l of coupon.matches) usedPairs.add(teamKey(l));
    }
  }

  return out;
}

function couponUsesBannedKeys(coupon, banned) {
  if (!coupon?.matches?.length || !banned?.size) return false;
  return coupon.matches.some((m) => banned.has(teamKey(m)));
}

/** Пересобрать один уровень (после «взять экспресс» / «заменить»). */
export function rebuildCapperLevel(level, singlesRows = [], excludeKeys = [], options = {}) {
  const profile = CAPPER_PROFILES[level];
  if (!profile) return null;
  const mustChange = new Set((options.mustChangeKeys || []).map(normKey));
  const otherExclude = new Set((excludeKeys || []).map(normKey));
  const isReplace = mustChange.size > 0;
  const seed = Number(options.replaceSeed) || 0;

  const profileSteps = isReplace
    ? [
        profile,
        {
          ...profile,
          minProb: Math.max(0.35, profile.minProb - 0.06),
          oddsMax: profile.oddsMax + 0.12,
        },
        {
          ...profile,
          minProb: Math.max(0.32, profile.minProb - 0.12),
          minTierA: Math.max(0, (profile.minTierA || 0) - 1),
          targetMin: Math.max(2.5, (profile.targetMin || 3) * 0.72),
          oddsMax: profile.oddsMax + 0.25,
        },
        {
          ...profile,
          outcomesOnly: false,
          minProb: Math.max(0.3, profile.minProb - 0.16),
          minTierA: Math.max(0, (profile.minTierA || 0) - 1),
          targetMin: Math.max(2, (profile.targetMin || 3) * 0.6),
          oddsMin: Math.max(1.25, profile.oddsMin - 0.08),
          oddsMax: profile.oddsMax + 0.45,
        },
      ]
    : [
        profile,
        {
          ...profile,
          minProb: Math.max(0.35, profile.minProb - 0.08),
          minTierA: Math.max(0, (profile.minTierA || 0) - 1),
        },
      ];

  const tryBuild = (pool, prof, baseExclude, requireFresh) => {
    const maxRot = Math.max(24, pool.length * 4);
    const start = Math.abs(seed + prof.legs * 7) % Math.max(pool.length, 1);
    for (let i = 0; i < maxRot; i++) {
      const rot = (start + i) % maxRot;
      const excl = new Set(baseExclude);
      for (const k of mustChange) excl.add(k);
      const coupon = buildCapperCoupon(pool, prof, singlesRows, excl, rot);
      if (!coupon) continue;
      if (requireFresh && couponUsesBannedKeys(coupon, mustChange)) continue;
      return coupon;
    }
    return null;
  };

  const excludeModes = isReplace
    ? [new Set(), otherExclude]
    : [otherExclude];

  let coupon = null;
  let partial = false;

  for (const prof of profileSteps) {
    const pool = buildCapperPool(prof, singlesRows);
    if (!pool.length) continue;
    for (const excl of excludeModes) {
      coupon = tryBuild(pool, prof, excl, isReplace);
      if (coupon) {
        if (excl === otherExclude && otherExclude.size) partial = true;
        break;
      }
    }
    if (coupon) break;
  }

  if (!coupon && isReplace) {
    const loose = profileSteps[profileSteps.length - 1];
    const pool = buildCapperPool(loose, singlesRows);
    coupon = tryBuild(pool, loose, new Set(), true);
    if (coupon) partial = true;
  }

  if (!coupon) return null;
  if (partial) coupon._partialReplace = true;
  return coupon;
}

export { SPORTS, SPORT_LABEL };
