/**
 * Скомпилированное ИИ-обоснование для купона экспресса
 * (те же факты, что у одинаров: форма, H2H, профиль).
 */

function ruMatches(n) {
  const k = Math.abs(n) % 100;
  const k1 = k % 10;
  if (k > 10 && k < 20) return `${n} матчей`;
  if (k1 === 1) return `${n} матч`;
  if (k1 >= 2 && k1 <= 4) return `${n} матча`;
  return `${n} матчей`;
}

function ruWins(n) {
  const k = Math.abs(n) % 100;
  const k1 = k % 10;
  if (k > 10 && k < 20) return `${n} побед`;
  if (k1 === 1) return `${n} победа`;
  if (k1 >= 2 && k1 <= 4) return `${n} победы`;
  return `${n} побед`;
}

function h2hPeriod(scopeLabel) {
  const s = String(scopeLabel || "");
  if (/мало/i.test(s)) return { when: "за последний год" };
  if (/12|год/i.test(s)) return { when: "за последний год" };
  if (/всё|все/i.test(s)) return { when: "за всё время в базе" };
  return { when: s || "в очных" };
}

function h2hAiLines(m, h) {
  if (!h || !(h.n > 0)) return [];
  const home = m.homeProfile?.name || m.home || "хозяева";
  const away = m.awayProfile?.name || m.away || "гости";
  const n = Number(h.n) || 0;
  const hw = Number(h.homeWins) || 0;
  const aw = Number(h.awayWins) || 0;
  const dr = Number(h.draws) || 0;
  const scores = (h.scores || []).filter(Boolean);
  const { when } = h2hPeriod(h.scopeLabel);
  const lines = [];

  if (n === 1 && scores.length === 1) {
    const sc = scores[0];
    if (hw === 1) lines.push(`${when.charAt(0).toUpperCase()}${when.slice(1)} играли один раз — победа «${home}» ${sc}.`);
    else if (aw === 1) lines.push(`${when.charAt(0).toUpperCase()}${when.slice(1)} играли один раз — победа «${away}» ${sc}.`);
    else lines.push(`${when.charAt(0).toUpperCase()}${when.slice(1)} играли один раз — ничья ${sc}.`);
  } else if (n === 1) {
    lines.push(`${when.charAt(0).toUpperCase()}${when.slice(1)} в базе только ${ruMatches(1)}.`);
  } else {
    lines.push(
      `${when.charAt(0).toUpperCase()}${when.slice(1)} сыграли ${ruMatches(n)}: у «${home}» ${ruWins(hw)}, у «${away}» ${ruWins(aw)}, ничьих ${dr}.`,
    );
    if (scores.length) lines.push(`Счета последних встреч: ${scores.join(", ")}.`);
  }

  if (n >= 3) {
    if (h.leanSide === "П1" && hw > aw) {
      lines.push(`По личным встречам чаще сильнее «${home}».`);
    } else if (h.leanSide === "П2" && aw > hw) {
      lines.push(`По личным встречам чаще сильнее «${away}».`);
    }
  }

  return lines;
}

function singleKey(row) {
  return `${row.home}|${row.away}`;
}

/** Собрать фактовые строки для одного матча (как collectAiLines в UI). */
export function collectAiLinesForSingle(m) {
  const out = [];
  const skip = new Set(
    (m.profilePick?.extras || []).map((e) => String(e.reason || "").trim()).filter(Boolean),
  );
  if (m.motivation?.text) skip.add(String(m.motivation.text).trim());

  const push = (s) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t || out.includes(t) || skip.has(t)) return;
    if (/^\d+\.\s*(основн|доп)/i.test(t)) return;
    out.push(t);
  };

  if (m.profilePick?.main?.reason) push(m.profilePick.main.reason);
  for (const line of m.profilePick?.why || []) push(line);
  if (m.comment) {
    for (const line of String(m.comment).split(/\n+/)) push(line);
  }
  for (const f of m.fourscoreFacts || []) push(f);

  const fa = m.awayProfile?.form || [];
  const fh = m.homeProfile?.form || [];
  if (fa.length >= 4 && fa.every((x) => x === "L")) {
    push(`У «${m.awayProfile?.name || m.away}» сейчас тяжёлая серия — ${fa.length} поражений подряд.`);
  }
  if (fh.length >= 4 && fh.every((x) => x === "W")) {
    push(`У «${m.homeProfile?.name || m.home}» серия из ${fh.length} побед.`);
  }

  const h = m.h2hSlim || (m.h2h?.n > 0 ? m.h2h : null);
  for (const line of h2hAiLines(m, h)) push(line);

  return out.slice(0, 5);
}

function legLabel(leg) {
  const pick = leg.pick || leg.market || "";
  return `${leg.home} — ${leg.away}${pick ? ` (${pick})` : ""}`;
}

const LEVEL_TAIL = {
  safe: (kf, n) => `${n} сильных одинара A, кф ×${kf} — самый спокойный вариант.`,
  medium: (kf, n) => `${n} одинара A, кф ×${kf} — выше уверенного, но без крайностей.`,
  risky: (kf, n) => `${n} исходов A, кф ×${kf} — реже заходит, потенциал выше.`,
};

/**
 * @param {object[]} legs — ноги купона
 * @param {object[]} singlesRows — одинары A (полные row)
 * @param {{ id?: string }} profile — safe | medium | risky
 */
export function buildExpressAiReasoning(legs, singlesRows, profile = {}) {
  const byKey = new Map();
  for (const row of singlesRows || []) {
    byKey.set(singleKey(row), row);
  }

  const lines = [];
  const used = new Set();

  for (const leg of legs || []) {
    const row = byKey.get(`${leg.home}|${leg.away}`);
    if (!row) {
      const fallback = leg.reason ? `${legLabel(leg)}: ${leg.reason}` : null;
      if (fallback && !used.has(fallback)) {
        used.add(fallback);
        lines.push(fallback);
      }
      continue;
    }

    const facts = collectAiLinesForSingle(row);
    if (!facts.length) {
      const fb = leg.reason || row.profilePick?.main?.reason;
      if (fb) {
        const line = `${leg.home} — ${leg.away}: ${fb}`;
        if (!used.has(line)) {
          used.add(line);
          lines.push(line);
        }
      }
      continue;
    }

    const pick = leg.pick || row.aiPick?.label || "";
    const head = pick ? `${leg.home} — ${leg.away} (${pick}): ` : `${leg.home} — ${leg.away}: `;
    const body = facts.slice(0, 2).join(" ");
    const line = head + body;
    if (!used.has(line)) {
      used.add(line);
      lines.push(line);
    }
  }

  const kf =
    Math.round(
      (legs || []).reduce((p, l) => p * (Number(l.odds) || 1.4), 1) * 100,
    ) / 100;
  const tailFn = LEVEL_TAIL[profile.id];
  if (tailFn) {
    lines.push(tailFn(kf, legs?.length || 0));
  }

  return {
    aiTitle: "ИИ · почему этот купон",
    aiReasoning: lines.slice(0, 7),
  };
}
