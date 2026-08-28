/**
 * Реальные очные (H2H) с 4score — не синтетика.
 * POST /events/{slug}/h2h-stats/ → список матчей + сводка голов.
 */

const YEAR_MS = 365 * 24 * 3600_000;
const cache = new Map();
const CACHE_MS = 6 * 3600_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function slugFromHref(href) {
  if (!href) return null;
  const m = String(href).match(/\/events\/([^/?#]+)\/?/);
  return m ? m[1] : null;
}

function parseRuDate(raw) {
  const m = String(raw || "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}

function parseMatches(html) {
  const out = [];
  for (const block of html.split('class="event-block"').slice(1)) {
    const dateRaw = block.match(/class="event-date">([^<]+)/)?.[1]?.trim();
    const date = parseRuDate(dateRaw);
    const loose = {
      localScore: Number(block.match(/data-localteam-score="(\d+)"/)?.[1]),
      visitorScore: Number(block.match(/data-visitorteam-score="(\d+)"/)?.[1]),
      localId: block.match(/data-localteam-id="(\d+)"/)?.[1],
      visitorId: block.match(/data-visitorteam-id="(\d+)"/)?.[1],
      curHome: block.match(/data-cur-localteam-id="(\d+)"/)?.[1],
      curAway: block.match(/data-cur-visitorteam-id="(\d+)"/)?.[1],
    };
    if (!Number.isFinite(loose.localScore) || !loose.curHome || !loose.curAway) continue;

    const scoreById = {
      [loose.localId]: loose.localScore,
      [loose.visitorId]: loose.visitorScore,
    };
    const homeGoals = scoreById[loose.curHome];
    const awayGoals = scoreById[loose.curAway];
    if (homeGoals == null || awayGoals == null) continue;

    let result = "draw";
    if (homeGoals > awayGoals) result = "home";
    else if (awayGoals > homeGoals) result = "away";

    const names = [
      ...block.matchAll(
        /class="event-name[^"]*"[^>]*>[\s\S]*?<span>([^<]+)<\/span>\s*<span>([^<]+)<\/span>/g,
      ),
    ];
    const scoreDisp = `${homeGoals}:${awayGoals}`;

    out.push({
      date: date ? date.toISOString().slice(0, 10) : null,
      dateRaw: dateRaw || null,
      homeGoals,
      awayGoals,
      score: scoreDisp,
      result,
      display:
        names[0]
          ? `${names[0][1].trim()} ${loose.localScore}:${loose.visitorScore} ${names[0][2].trim()}`
          : scoreDisp,
    });
  }
  return out;
}

function summarize(matches, homeName, awayName, { yearOnly }) {
  const now = Date.now();
  let pool = matches;
  let scope = "all";
  if (yearOnly) {
    const recent = matches.filter((m) => {
      if (!m.date) return false;
      return now - new Date(m.date).getTime() <= YEAR_MS;
    });
    if (recent.length >= 2) {
      pool = recent;
      scope = "year";
    } else {
      scope = recent.length ? "year_sparse" : "all";
      if (recent.length) pool = recent;
    }
  }

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const m of pool) {
    if (m.result === "home") homeWins++;
    else if (m.result === "away") awayWins++;
    else draws++;
  }
  const n = pool.length;
  const scores = pool.map((m) => m.score).slice(0, 8);

  let lean = "even";
  let leanSide = null;
  if (n >= 2) {
    if (homeWins >= awayWins + 2 && homeWins / n >= 0.5) {
      lean = "home";
      leanSide = "П1";
    } else if (awayWins >= homeWins + 2 && awayWins / n >= 0.5) {
      lean = "away";
      leanSide = "П2";
    } else if (homeWins > awayWins && homeWins >= 2) {
      lean = "home_soft";
      leanSide = "П1";
    } else if (awayWins > homeWins && awayWins >= 2) {
      lean = "away_soft";
      leanSide = "П2";
    }
  }

  const scopeLabel =
    scope === "year"
      ? "за 12 мес."
      : scope === "year_sparse"
        ? "за 12 мес."
        : "за всё время в базе";

  const why = n
    ? `Очные ${scopeLabel}: ${homeWins}–${draws}–${awayWins} (${homeName} побед — ничьи — ${awayName}) · ${scores.join(", ")}`
    : "Очных в базе 4score нет";

  return {
    ok: n > 0,
    n,
    homeWins,
    awayWins,
    draws,
    lean,
    leanSide,
    scope,
    scopeLabel,
    scores,
    matches: pool.slice(0, 10),
    why,
    source: "4score_h2h",
  };
}

/**
 * Тянет H2H по slug страницы матча 4score.
 */
export async function fetchH2hBySlug(slug, homeName, awayName) {
  if (!slug) return { ok: false, reason: "нет slug" };
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const url = `https://4score.ru/events/${slug}/h2h-stats/`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let html = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Referer: `https://4score.ru/events/${slug}/`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "*/*",
      },
      body: "filters%5Bindicators%5D=goals&filters%5Bperiods%5D=full",
      signal: ctrl.signal,
    });
    html = await res.text();
    if (!res.ok || !html) {
      const miss = { ok: false, reason: `HTTP ${res.status}` };
      cache.set(slug, { at: Date.now(), data: miss });
      return miss;
    }
  } catch (e) {
    return { ok: false, reason: e.message };
  } finally {
    clearTimeout(timer);
  }

  const matches = parseMatches(html);
  const data = summarize(matches, homeName, awayName, { yearOnly: true });
  cache.set(slug, { at: Date.now(), data });
  return data;
}

export function slugFromMatch(m) {
  return slugFromHref(m.href);
}

const SOURCE_WHY = {
  "4score_ai": "ИИ 4score",
  poisson: "модель Пуассона",
  model: "модель",
  live_score: "лайв по счёту (эвристика)",
  line_favorite: "фаворит линии",
  "4score_h2h": "очные 4score",
};

/**
 * Строка «почему» без H2H.
 */
export function whyFromPick(pick) {
  if (!pick?.label) return null;
  const src = SOURCE_WHY[pick.source] || pick.source || "сигнал";
  return `${src}: ${pick.label}`;
}

/**
 * Влияние H2H на пик: при явном перекосе очных — сдвиг к П1/П2.
 */
export function applyH2hToMatch(match, h2h) {
  const baseWhy = whyFromPick(match.aiPick);
  if (!h2h?.ok) {
    return {
      ...match,
      h2h: h2h || null,
      why: baseWhy,
    };
  }

  let aiPick = match.aiPick ? { ...match.aiPick } : null;
  const strong = h2h.lean === "home" || h2h.lean === "away";
  const soft = h2h.lean === "home_soft" || h2h.lean === "away_soft";

  if (strong && h2h.leanSide) {
    const label = h2h.leanSide;
    const rate =
      label === "П1" ? h2h.homeWins / h2h.n : h2h.awayWins / h2h.n;
    const shouldOverride =
      !aiPick ||
      aiPick.source === "live_score" ||
      aiPick.source === "line_favorite" ||
      (aiPick.family === "1x2" &&
        aiPick.label !== label &&
        aiPick.label !== "1X" &&
        aiPick.label !== "X2");

    if (shouldOverride) {
      aiPick = {
        label,
        code: label,
        prob: Math.round(Math.min(0.75, 0.45 + rate * 0.35) * 1000) / 1000,
        tier: rate >= 0.6 ? "A" : "B",
        family: "1x2",
        source: "4score_h2h",
        odds: aiPick?.odds ?? null,
      };
    } else if (aiPick && aiPick.label === label) {
      aiPick = {
        ...aiPick,
        tier: aiPick.tier === "C" ? "B" : aiPick.tier === "B" && rate >= 0.6 ? "A" : aiPick.tier,
        prob: Math.max(aiPick.prob || 0, Math.round(rate * 1000) / 1000),
      };
    }
  } else if (soft && aiPick?.source === "live_score" && h2h.leanSide) {
    // слабый перекос: не ломаем лайв, но подсветим в why
  }

  const whyParts = [h2h.why];
  if (aiPick) {
    const src = SOURCE_WHY[aiPick.source] || aiPick.source;
    whyParts.unshift(`${src}: ${aiPick.label}`);
  } else if (baseWhy) {
    whyParts.unshift(baseWhy);
  }
  if (strong) {
    whyParts.push(
      h2h.leanSide === "П2"
        ? `перекос очных → ${match.away}`
        : `перекос очных → ${match.home}`,
    );
  }

  return {
    ...match,
    aiPick,
    h2h: {
      n: h2h.n,
      homeWins: h2h.homeWins,
      awayWins: h2h.awayWins,
      draws: h2h.draws,
      lean: h2h.lean,
      leanSide: h2h.leanSide,
      scopeLabel: h2h.scopeLabel,
      scores: h2h.scores,
      why: h2h.why,
    },
    why: whyParts.filter(Boolean).join(" · "),
  };
}

/**
 * Обогатить приоритетные матчи очными (только прематч-футбол с href).
 * Сначала ТОП / модель / сильный пик — чтобы одинары в ленте чаще имели H2H.
 */
export async function enrichMatchesWithH2h(matches, { limit = 40 } = {}) {
  const football = (matches || []).filter(
    (m) =>
      !m.isLive &&
      (m.sport || "football") === "football" &&
      slugFromMatch(m),
  );

  const rank = (m) => {
    let s = m.aiPick?.prob || 0;
    if (m.isTop || m.aiPick?.isTop) s += 4;
    if (m.model?.ok) s += 2;
    if (m.recommendation?.isTop) s += 2;
    if (m.aiPick && m.aiPick.source !== "line_favorite") s += 0.5;
    return s;
  };
  football.sort((a, b) => rank(b) - rank(a));
  const targets = football.slice(0, limit);

  const byKey = new Map();
  const conc = 4;
  for (let i = 0; i < targets.length; i += conc) {
    const chunk = targets.slice(i, i + conc);
    await Promise.all(
      chunk.map(async (m) => {
        const slug = slugFromMatch(m);
        const h2h = await fetchH2hBySlug(slug, m.home, m.away);
        byKey.set(`${m.home}|${m.away}|${m.kickoff || ""}`, h2h);
      }),
    );
  }

  return (matches || []).map((m) => {
    const h2h = byKey.get(`${m.home}|${m.away}|${m.kickoff || ""}`);
    if (h2h) return applyH2hToMatch(m, h2h);
    return {
      ...m,
      why: whyFromPick(m.aiPick),
      h2h: null,
    };
  });
}
