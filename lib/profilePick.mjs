/**
 * Выбор: 1 основная + 2 доп. по профилям.
 * Основная с кф < 1.33 не берём — следующий кандидат или комбо (1X+ТБ 2.5 и т.п.).
 */

const MIN_MAIN_ODDS = 1.33;
const ITB15_MIN_N = 8;
const ITB15_MIN_RATE = 0.7;

/** Форма за голы: обе команды часто забивают ≥1.5 (ИТБ 1.5). */
export function formSupportsGoals(homeProfile, awayProfile) {
  const h = homeProfile?.betTable;
  const a = awayProfile?.betTable;
  if (!h?.itb15 || !a?.itb15) return false;
  return (
    rate(h.itb15) >= 0.5 &&
    rate(a.itb15) >= 0.5 &&
    h.itb15.n >= 6 &&
    a.itb15.n >= 6
  );
}

/** Очные подтверждают голы: ТБ 2.5 или ОЗ в большинстве последних встреч. */
export function h2hSupportsGoals(h2h) {
  const scores = h2h?.scores || [];
  if (scores.length < 2 && (h2h?.n || 0) < 2) return false;
  let over = 0;
  let btts = 0;
  for (const sc of scores.slice(0, 5)) {
    const parts = String(sc).split(/[:\-–]/);
    const hg = Number(parts[0]);
    const ag = Number(parts[1]);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    if (hg + ag >= 3) over++;
    if (hg > 0 && ag > 0) btts++;
  }
  const n = scores.length;
  if (!n) return false;
  return over >= Math.ceil(n * 0.5) || (btts >= Math.ceil(n * 0.6) && over >= 1);
}

function sameSideCode(a, b) {
  const home = new Set(["П1", "1X", "1"]);
  const away = new Set(["П2", "X2", "2"]);
  if (home.has(a) && home.has(b)) return true;
  if (away.has(a) && away.has(b)) return true;
  return a === b;
}

function nudgeMainProbWithH2h(main, h2h) {
  if (!main?.code || !h2h?.n || h2h.n < 2 || !h2h.leanSide) return main;
  const lean = h2h.leanSide;
  const winRate = lean === "П1" ? h2h.homeWins / h2h.n : h2h.awayWins / h2h.n;
  const strong = h2h.lean === "home" || h2h.lean === "away";
  let prob = Number(main.prob) || 0.5;

  if (sameSideCode(lean, main.code)) {
    prob += 0.03 + (strong ? 0.04 : 0.02) * winRate;
  } else if (
    strong &&
    ((lean === "П1" && (main.code === "П2" || main.code === "X2")) ||
      (lean === "П2" && (main.code === "П1" || main.code === "1X")))
  ) {
    prob -= 0.03;
  }

  return {
    ...main,
    prob: Math.round(Math.min(0.88, Math.max(0.32, prob)) * 1000) / 1000,
    tier:
      prob >= 0.68 && main.tier === "B"
        ? "A"
        : prob < 0.48 && main.tier === "A"
          ? "B"
          : main.tier,
  };
}

function odds1x2(odds, code) {
  if (!odds) return null;
  if (code === "П1" || code === "1") return Number(odds.p1) || null;
  if (code === "П2" || code === "2") return Number(odds.p2) || null;
  if (code === "Х" || code === "X") return Number(odds.x) || null;
  if (code === "1X") {
    const a = Number(odds.p1);
    const x = Number(odds.x);
    if (a > 1 && x > 1) return Math.round((1 / (1 / a + 1 / x)) * 100) / 100;
    return null;
  }
  if (code === "X2") {
    const b = Number(odds.p2);
    const x = Number(odds.x);
    if (b > 1 && x > 1) return Math.round((1 / (1 / b + 1 / x)) * 100) / 100;
    return null;
  }
  return null;
}

function riskOdds(risk, code) {
  const hit = (risk?.combos || []).find((c) => c.code === code);
  return hit ? Number(hit.odds) || null : null;
}

function riskPack(risk, code) {
  const hit = (risk?.combos || []).find((c) => c.code === code);
  if (!hit?.label) return null;
  return {
    label: hit.label,
    code: hit.code,
    family: "combo",
    prob: hit.prob,
    odds: Number(hit.odds) || null,
    oddsSource: hit.oddsSource || "estimate",
    reason: `Кф одиночной идеи мелкий — берём связку ${hit.label}.`,
    tier: "B",
    source: "profile",
  };
}

function rate(cell) {
  if (!cell?.n) return 0;
  return cell.hit / cell.n;
}

function pack(partial, odds, risk) {
  let o = partial.odds;
  let oddsSource = partial.oddsSource || "none";
  if (o == null) {
    if (partial.family === "1x2") {
      o = odds1x2(odds, partial.code);
      if (o) oddsSource = "stavka";
    } else {
      o = riskOdds(risk, partial.code);
      if (o) oddsSource = "estimate";
    }
  }
  return {
    label: partial.label,
    code: partial.code,
    family: partial.family,
    prob: Math.round(partial.prob * 1000) / 1000,
    odds: o ?? null,
    oddsSource,
    reason: partial.reason,
    tier: partial.tier || (partial.prob >= 0.65 ? "A" : "B"),
    source: "profile",
  };
}

function oddsOk(c) {
  return Number(c?.odds) >= MIN_MAIN_ODDS;
}

/** Поднять мелкий кф комбо из risk */
function liftWithCombo(base, risk) {
  if (!base || !risk) return null;
  const code = String(base.code || "");
  const prefer = [];
  if (code === "BTTS") prefer.push("BTTS_O25", "1X_O25", "O25", "P1_O25");
  else if (code === "O25") prefer.push("1X_O25", "P1_O25", "BTTS_O25", "1X_O15");
  else if (code === "П1") prefer.push("P1_O25", "1X_O25", "1X_O15");
  else if (code === "П2") prefer.push("P2_O25", "X2_O25", "X2_O15");
  else if (code === "1X") prefer.push("1X_O25", "1X_O15", "O25");
  else if (code === "X2") prefer.push("X2_O25", "X2_O15", "O25");
  else prefer.push("1X_O25", "O25", "BTTS_O25", "P1_O25");

  for (const id of prefer) {
    const hit = riskPack(risk, id);
    if (hit && oddsOk(hit)) {
      hit.reason = `Вместо короткого «${base.label}» — ${hit.label}.`;
      return hit;
    }
  }
  return null;
}

function collectCandidates(homeProfile, awayProfile, { odds, risk, h2h, homeName, awayName }) {
  const h = homeProfile.betTable;
  const a = awayProfile.betTable;
  const hs = homeProfile.summary;
  const as_ = awayProfile.summary;
  const outcomes = [];
  const extras = [];

  const hw = rate(h.win);
  const aw = rate(a.win);
  const hl = rate(h.loss);
  const al = rate(a.loss);
  const homeAtk = Number(hs.avgIT) || 0;
  const awayAtk = Number(as_.avgIT) || 0;
  const homeDef = Number(hs.avgITOpp) || 0;
  const awayDef = Number(as_.avgITOpp) || 0;
  const avgT = ((Number(hs.avgT) || 0) + (Number(as_.avgT) || 0)) / 2;

  // --- Исходы (главное) ---
  const homeEdge =
    (hw - aw) * 0.45 +
    (homeAtk - awayAtk) * 0.2 +
    (awayDef - homeDef) * 0.15 +
    (al - hl) * 0.2;
  const awayEdge = -homeEdge;

  let h2hLean = 0;
  if (h2h?.n >= 2 && h2h.leanSide) {
    const winRate =
      h2h.leanSide === "П1" ? h2h.homeWins / h2h.n : h2h.awayWins / h2h.n;
    if (h2h.lean === "home") h2hLean = 0.14 * winRate;
    else if (h2h.lean === "away") h2hLean = -0.14 * winRate;
    else if (h2h.lean === "home_soft") h2hLean = 0.07;
    else if (h2h.lean === "away_soft") h2hLean = -0.07;
  }

  const edge = homeEdge + h2hLean;

  if (edge >= 0.12 || (hw >= 0.5 && homeAtk >= awayAtk + 0.1)) {
    outcomes.push({
      label: "П1",
      code: "П1",
      family: "1x2",
      prob: Math.min(0.74, 0.42 + hw * 0.35 + Math.max(0, edge) * 0.25),
      score: 1.2 + Math.max(0, edge) + hw * 0.3,
      reason: `${homeName}: лучше форма/атака (${homeAtk.toFixed(1)} vs ${awayAtk.toFixed(1)} гол/матч), побед ${h.win?.label || "—"}.`,
      tier: hw >= 0.55 || edge >= 0.2 ? "A" : "B",
    });
  } else if (hl <= 0.35 || edge >= 0) {
    outcomes.push({
      label: "1X",
      code: "1X",
      family: "1x2",
      prob: Math.min(0.8, 0.52 + (1 - hl) * 0.28),
      score: 1.05 + (1 - hl) * 0.35,
      reason: `${homeName} редко проигрывает (${h.loss?.label || "—"} пор.) — безопаснее 1X.`,
      tier: hl <= 0.25 ? "A" : "B",
    });
  }

  if (awayEdge >= 0.12 || (aw >= 0.5 && awayAtk >= homeAtk + 0.1)) {
    outcomes.push({
      label: "П2",
      code: "П2",
      family: "1x2",
      prob: Math.min(0.74, 0.42 + aw * 0.35 + Math.max(0, awayEdge) * 0.25),
      score: 1.2 + Math.max(0, awayEdge) + aw * 0.3,
      reason: `${awayName}: острее/стабильнее в атаке (${awayAtk.toFixed(1)} vs ${homeAtk.toFixed(1)}), побед ${a.win?.label || "—"}.`,
      tier: aw >= 0.55 || awayEdge >= 0.2 ? "A" : "B",
    });
  } else if (al <= 0.35 && edge < 0.08) {
    outcomes.push({
      label: "X2",
      code: "X2",
      family: "1x2",
      prob: Math.min(0.8, 0.52 + (1 - al) * 0.28),
      score: 1.0 + (1 - al) * 0.35,
      reason: `${awayName} редко проигрывает (${a.loss?.label || "—"} пор.) — X2.`,
      tier: al <= 0.25 ? "A" : "B",
    });
  }

  // если исходов нет — хотя бы сторона по линии формы
  if (!outcomes.length) {
    if (hw >= aw) {
      outcomes.push({
        label: hw - aw >= 0.15 ? "П1" : "1X",
        code: hw - aw >= 0.15 ? "П1" : "1X",
        family: "1x2",
        prob: hw - aw >= 0.15 ? 0.55 : 0.62,
        score: 0.85,
        reason: `По форме чуть сильнее хозяева (${h.win?.label || "—"} побед) — берём исход, не тотал.`,
        tier: "B",
      });
    } else {
      outcomes.push({
        label: aw - hw >= 0.15 ? "П2" : "X2",
        code: aw - hw >= 0.15 ? "П2" : "X2",
        family: "1x2",
        prob: aw - hw >= 0.15 ? 0.55 : 0.62,
        score: 0.85,
        reason: `По форме чуть сильнее гости (${a.win?.label || "—"} побед) — берём исход, не тотал.`,
        tier: "B",
      });
    }
  }

  // --- Допы: ОЗ / ТБ (никогда не главные) ---
  const bothItb15 =
    rate(h.itb15) >= ITB15_MIN_RATE &&
    rate(a.itb15) >= ITB15_MIN_RATE &&
    (h.itb15?.n || 0) >= ITB15_MIN_N &&
    (a.itb15?.n || 0) >= ITB15_MIN_N;

  if (bothItb15) {
    const strength = (rate(h.itb15) + rate(a.itb15) + rate(h.btts) + rate(a.btts)) / 4;
    extras.push({
      label: "ОЗ — да",
      code: "BTTS",
      family: "total",
      prob: Math.min(0.82, 0.5 + strength * 0.35),
      score: 0.4 + strength * 0.3,
      reason: `ИТБ 1.5 у обеих ≥70% за последние игры — ОЗ как доп. к исходу.`,
      tier: "B",
      asExtra: true,
    });
  }

  if (formSupportsGoals(homeProfile, awayProfile) && h2hSupportsGoals(h2h)) {
    const strength = (rate(h.over25) + rate(a.over25) + rate(h.itb15) + rate(a.itb15)) / 4;
    extras.push({
      label: "ТБ 2.5",
      code: "O25",
      family: "total",
      prob: Math.min(0.78, strength),
      score: 0.35 + strength * 0.3,
      reason: `Форма и очные за голы — ТБ 2.5 как доп.`,
      tier: "B",
      asExtra: true,
    });
  }

  outcomes.sort((a, b) => b.score - a.score);
  extras.sort((a, b) => b.score - a.score);

  const packList = (arr) => {
    const uniq = [];
    const seen = new Set();
    for (const c of arr) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      uniq.push(pack(c, odds, risk));
    }
    return uniq;
  };

  return {
    outcomes: packList(outcomes),
    extras: packList(extras),
  };
}

/**
 * @returns {null | { label, code, family, prob, odds, why, tier, source, main, extras }}
 */
export function pickFromProfiles(homeProfile, awayProfile, opts = {}) {
  if (!homeProfile?.betTable || !awayProfile?.betTable) return null;

  const risk = opts.risk || null;
  const { outcomes, extras: sideExtras } = collectCandidates(homeProfile, awayProfile, {
    odds: opts.odds || {},
    risk,
    h2h: opts.h2h || null,
    homeName: opts.homeName || homeProfile.name || "П1",
    awayName: opts.awayName || awayProfile.name || "П2",
  });
  if (!outcomes.length) return null;

  // Главная — только исход (1X2). ОЗ/ТБ не в main.
  let main = outcomes.find((c) => oddsOk(c)) || null;
  if (!main) main = liftWithCombo(outcomes[0], risk);
  if (!main) {
    main = [...outcomes].sort((a, b) => (Number(b.odds) || 0) - (Number(a.odds) || 0))[0];
  }

  // Допы: сначала ОЗ/ТБ, потом другой исход
  const extras = [];
  for (const ex of sideExtras) {
    if (ex.code === main.code) continue;
    extras.push(ex);
    if (extras.length >= 2) break;
  }
  if (extras.length < 2) {
    for (const o of outcomes) {
      if (o.code === main.code) continue;
      if (extras.some((e) => e.code === o.code)) continue;
      extras.push({
        ...o,
        reason: o.reason || `Альтернативный исход ${o.label}.`,
      });
      if (extras.length >= 2) break;
    }
  }

  if (main.family === "combo" && extras.length < 2) {
    const short = outcomes.find((c) => !oddsOk(c) && c.code !== main.code);
    if (short && !extras.some((e) => e.code === short.code)) {
      extras.push({
        ...short,
        reason: `${short.reason} Кф короткий (${Number(short.odds || 0).toFixed(2)}) — только как идея.`,
      });
    }
  }

  main = nudgeMainProbWithH2h(main, opts.h2h || null);

  const why = [
    `1. Основная — ${main.label}${main.odds ? ` @ ${Number(main.odds).toFixed(2)}` : ""}`,
    main.reason,
  ];
  extras.slice(0, 2).forEach((ex, i) => {
    why.push(
      `${i + 2}. Доп. — ${ex.label}${ex.odds ? ` @ ${Number(ex.odds).toFixed(2)}` : ""}`,
    );
    why.push(ex.reason);
  });

  return {
    ...main,
    why,
    main,
    extras: extras.slice(0, 2),
  };
}

export { MIN_MAIN_ODDS };
