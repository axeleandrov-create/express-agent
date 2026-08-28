/** Факториал и Пуассон без внешних библиотек. */

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

/**
 * Вероятности П1/Х/П2 по силам команд и средним лиги.
 * strength: { attackHome, attackAway, defenseHome, defenseAway }
 */
export function matchOutcomeProbs(homeStr, awayStr, avgHome, avgAway, maxGoals = 8) {
  let lam = avgHome * homeStr.attackHome * awayStr.defenseAway;
  let mu = avgAway * awayStr.attackAway * homeStr.defenseHome;
  lam = Math.max(0.05, Math.min(lam, 5));
  mu = Math.max(0.05, Math.min(mu, 5));

  let p1 = 0;
  let px = 0;
  let p2 = 0;
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, lam) * poissonPmf(j, mu);
      if (i > j) p1 += p;
      else if (i === j) px += p;
      else p2 += p;
    }
  }
  const t = p1 + px + p2 || 1;
  return {
    home: p1 / t,
    draw: px / t,
    away: p2 / t,
    lambda: Math.round(lam * 100) / 100,
    mu: Math.round(mu * 100) / 100,
  };
}

export function deVigOdds(odds) {
  const inv = {
    home: odds.p1 ? 1 / odds.p1 : 0,
    draw: odds.x ? 1 / odds.x : 0,
    away: odds.p2 ? 1 / odds.p2 : 0,
  };
  const s = inv.home + inv.draw + inv.away || 1;
  return {
    home: inv.home / s,
    draw: inv.draw / s,
    away: inv.away / s,
  };
}

/** Оценка кф 1X / X2 из линии 1X2 (если двойного шанса нет на сайте). */
export function impliedDoubleChanceOdds(odds, side) {
  const pure = deVigOdds(odds);
  if (side === "1X") {
    const p = pure.home + pure.draw;
    return p > 0.05 ? Math.round((1 / p) * 100) / 100 : null;
  }
  if (side === "X2") {
    const p = pure.draw + pure.away;
    return p > 0.05 ? Math.round((1 / p) * 100) / 100 : null;
  }
  return null;
}

/**
 * Выбор ставки и проверка ТОП:
 * кф >= 1.30, наша вероятность > 65%, валуй > 5%.
 * Если сильнее всех ничья — рекомендуем 1X или X2 (к более сильной стороне).
 */
export function pickTopBet(probs, odds) {
  const candidates = [];

  const add = (code, label, prob, odd) => {
    if (!odd || odd < 1.01) return;
    const value = prob * odd - 1;
    candidates.push({ code, label, prob, odds: odd, value });
  };

  add("П1", "П1", probs.home, odds.p1);
  add("П2", "П2", probs.away, odds.p2);
  add("Х", "Х", probs.draw, odds.x);

  const p1x = probs.home + probs.draw;
  const px2 = probs.draw + probs.away;
  const odd1x = impliedDoubleChanceOdds(odds, "1X");
  const oddX2 = impliedDoubleChanceOdds(odds, "X2");
  add("1X", "1X", p1x, odd1x);
  add("X2", "X2", px2, oddX2);

  // Если чистая ничья лидирует среди 1X2 — предпочитаем 1X/X2
  const plainBest = [
    { code: "П1", p: probs.home },
    { code: "Х", p: probs.draw },
    { code: "П2", p: probs.away },
  ].sort((a, b) => b.p - a.p)[0];

  let ranked = [...candidates].sort((a, b) => b.value - a.value);

  if (plainBest.code === "Х") {
    const prefer = probs.home >= probs.away ? "1X" : "X2";
    ranked = [
      ...ranked.filter((c) => c.code === prefer),
      ...ranked.filter((c) => c.code !== prefer && c.code !== "Х"),
    ];
  } else {
    // Не предлагаем чистую Х в ТОП, если есть 1X/X2
    ranked = ranked.filter((c) => c.code !== "Х");
  }

  const top = ranked.find(
    (c) => c.prob > 0.65 && c.value > 0.08 && c.odds >= 1.3,
  );

  // Мягкий сигнал: есть валуй и кф, уверенность чуть ниже ТОП
  const signal = ranked.find(
    (c) =>
      !top &&
      c.value > 0.08 &&
      c.odds >= 1.3 &&
      (c.prob > 0.55 ||
        ((c.code === "1X" || c.code === "X2") && c.prob > 0.68)),
  );

  const best = ranked[0] || null;

  const pack = (c, tier) =>
    c
      ? {
          code: c.code,
          label: c.label,
          prob: Math.round(c.prob * 1000) / 1000,
          odds: c.odds,
          value: Math.round(c.value * 1000) / 1000,
          isTop: tier === "top",
          isSignal: tier === "signal" || tier === "top",
          tier,
        }
      : null;

  return {
    recommendation: pack(top, "top") || pack(signal, "signal"),
    bestAny: pack(best, "best"),
    all: ranked.map((c) => ({
      ...c,
      prob: Math.round(c.prob * 1000) / 1000,
      value: Math.round(c.value * 1000) / 1000,
    })),
  };
}

export function buildThoughts(row, model) {
  const rec = model.recommendation || model.bestAny;
  const factors = [];

  if (model.lambda != null) {
    factors.push(
      `Ожидаемые голы (λ/μ): ${model.lambda} — ${model.mu} (Пуассон по последним матчам)`,
    );
  }
  if (model.formHome) factors.push(`Хозяева: ${model.formHome}`);
  if (model.formAway) factors.push(`Гости: ${model.formAway}`);
  if (model.matchedAs) {
    factors.push(`История сопоставлена как: ${model.matchedAs}`);
  }

  if (!model.ok) {
    return {
      summary: "Данных мало, не советую ставить на этот матч по модели.",
      math: "Нет истории голов для Пуассона (или имена не совпали с football-data).",
      factors: factors.length ? factors : ["Модель недоступна"],
      recommend: false,
    };
  }

  if (model.recommendation) {
    const r = model.recommendation;
    const tag = r.isTop ? "ТОП" : "СИГНАЛ";
    return {
      summary: `${tag}: ${r.label} @ ${r.odds} · модель ${(r.prob * 100).toFixed(0)}% · валуй ${(r.value * 100).toFixed(1)}%`,
      math: `Наша вероятность ${(r.prob * 100).toFixed(1)}% при кф ${r.odds}. Валуй = ${((r.prob * r.odds - 1) * 100).toFixed(1)}% (нужно > 5%). Линия Stavka П1/Х/П2: ${row.odds?.p1 ?? "—"} / ${row.odds?.x ?? "—"} / ${row.odds?.p2 ?? "—"}.`,
      factors,
      recommend: true,
    };
  }

  const b = model.bestAny;
  return {
    summary: b
      ? `Не ТОП: лучшее по модели ${b.label}, но пороги не пройдены (нужны % > 65%, валуй > 5%, кф ≥ 1.30).`
      : "Модель посчитала матч, явного перевеса нет.",
    math: b
      ? `${b.label}: модель ${(b.prob * 100).toFixed(0)}%, кф ${b.odds}, валуй ${(b.value * 100).toFixed(1)}%.`
      : "Нет валидных кэфов для сравнения.",
    factors,
    recommend: false,
  };
}
