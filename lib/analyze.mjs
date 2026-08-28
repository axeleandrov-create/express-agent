import { fetchStavkaMatches } from "./stavka.mjs";
import { fetchFourScoreBoard } from "./fourscore.mjs";
import {
  fetchFourScoreOutcomes,
  attachOutcomesToMatches,
} from "./fourscoreAi.mjs";
import { fetchForebetPredictions } from "./forebet.mjs";
import { loadHistoryIndex, lookupTeamStrength } from "./history.mjs";
import { buildTeamProfile } from "./teamProfile.mjs";
import { pickFromProfiles } from "./profilePick.mjs";
import {
  matchOutcomeProbs,
  pickTopBet,
  buildThoughts,
  deVigOdds,
} from "./poisson.mjs";
import { attachRiskToMatch,
  generateHighRiskExpress,
  generateHighRiskExpressList,
} from "./riskMarkets.mjs";
import { countByPeriod, tagMatchPeriods } from "./periods.mjs";
import {
  buildAllPeriodBuckets,
  buildPeriodExpresses,
} from "./periodExpress.mjs";
import {
  buildExpressBySizes,
  buildSinglesFeed,
  buildSinglesBySport,
  buildSinglesArchiveBySport,
  buildLiveFeed,
  buildCapperExpresses,
  isUsefulGoalFact,
} from "./expressFeed.mjs";
import { buildSafeAccumulators } from "./safeAccumulator.mjs";
import { detectDroppingOdds } from "./droppingOdds.mjs";
import { buildValueTopFeed } from "./valueFeed.mjs";
import { valueEdge, attachValueToPick } from "./value.mjs";
import { recordBoardPicks, getLearnBoosts, winningRules } from "./learn.mjs";
import { enrichMatchesWithH2h } from "./h2h.mjs";
import { enrichMatchesWithFourscoreStats, enrichMatchesWithExtraStats } from "./fourscoreTeamStats.mjs";
import { findByTeams, teamsSimilar } from "./names.mjs";

let historyCache = { at: 0, index: null };
const HISTORY_TTL = 6 * 3600_000;

async function getHistory(force = false) {
  if (!force && historyCache.index && Date.now() - historyCache.at < HISTORY_TTL) {
    return historyCache.index;
  }
  const index = await loadHistoryIndex();
  historyCache = { at: Date.now(), index };
  return index;
}

function isNonSeniorMenSide(name) {
  const s = String(name || "").toLowerCase();
  return (
    /\(ж\)|\(жен|женск|women|\bu\d+\b|до\s*21|u21|youth|юнош|молод/i.test(s) ||
    /\bw\b/.test(s) // Feyenoord W
  );
}

function analyzeOne(row, index) {
  if (isNonSeniorMenSide(row.home) || isNonSeniorMenSide(row.away)) {
    const model = { ok: false, reason: "не мужская основа (ж/молодёжь)" };
    return ensureAiPick({
      ...row,
      model,
      thoughts: buildThoughts(row, model),
      isTop: false,
      isSignal: false,
      recommendation: null,
    });
  }

  const found = lookupTeamStrength(index, row.home, row.away, row.league || "");
  if (!found.ok) {
    const model = { ok: false, reason: found.reason };
    return ensureAiPick({
      ...row,
      model,
      thoughts: buildThoughts(row, model),
      isTop: false,
      isSignal: false,
      recommendation: null,
    });
  }

  const probs = matchOutcomeProbs(
    found.homeStr,
    found.awayStr,
    found.avgHome,
    found.avgAway,
  );
  const odds = row.odds || {};
  const pick = pickTopBet(probs, odds);
  const linePure = deVigOdds(odds);

  const model = {
    ok: true,
    source: "Пуассон · football-data",
    probs: {
      home: Math.round(probs.home * 1000) / 1000,
      draw: Math.round(probs.draw * 1000) / 1000,
      away: Math.round(probs.away * 1000) / 1000,
    },
    linePure: {
      home: Math.round(linePure.home * 1000) / 1000,
      draw: Math.round(linePure.draw * 1000) / 1000,
      away: Math.round(linePure.away * 1000) / 1000,
    },
    lambda: probs.lambda,
    mu: probs.mu,
    formHome: found.formHome,
    formAway: found.formAway,
    factsHome: found.factsHome || null,
    factsAway: found.factsAway || null,
    factsHomeVenue: found.factsHomeVenue || null,
    factsAwayVenue: found.factsAwayVenue || null,
    matchedAs: `${found.homeCsv} — ${found.awayCsv} (${found.leagueName})`,
    recommendation: pick.recommendation,
    bestAny: pick.bestAny,
  };

  const homeProfile = buildTeamProfile(found.rows, found.homeCsv, {
    n: 10,
    venue: "any",
    displayName: row.home,
  });
  const awayProfile = buildTeamProfile(found.rows, found.awayCsv, {
    n: 10,
    venue: "any",
    displayName: row.away,
  });

  const thoughts = buildThoughts(row, model);
  const rec = pick.recommendation;
  const withRisk = attachRiskToMatch(
    {
      ...row,
      model,
      thoughts,
      isTop: Boolean(rec?.isTop),
      isSignal: Boolean(rec?.isSignal),
      recommendation: rec,
      homeProfile,
      awayProfile,
    },
    probs.lambda,
    probs.mu,
  );

  const profilePick = pickFromProfiles(homeProfile, awayProfile, {
    odds: row.odds || {},
    risk: withRisk.risk,
    h2h: row.h2h || null,
    homeName: row.home,
    awayName: row.away,
  });

  return ensureAiPick({
    ...withRisk,
    profilePick,
  });
}

/** Если нет 4score AI — берём рекомендацию модели / bestAny / эвристику лайва. */
function ensureAiPick(m) {
  if (m.aiPick?.label) {
    const withVal = attachValueToPick(m.aiPick);
    return { ...m, aiPick: withVal, isTop: m.isTop || withVal.isTop };
  }
  const r = m.recommendation || m.model?.bestAny;
  if (r) {
    const odds = r.odds ?? null;
    const value = valueEdge(r.prob, odds);
    const top = Boolean(r.isTop) || (value != null && value > 0.08);
    const tier = top ? "A" : r.prob >= 0.65 ? "A" : r.prob >= 0.5 ? "B" : "C";
    return {
      ...m,
      aiPick: {
        label: r.label || r.code,
        code: r.code,
        prob: r.prob,
        tier,
        family: "1x2",
        source: "poisson",
        odds,
        value,
        isTop: top,
      },
      isTop: top || m.isTop,
    };
  }
  if (m.isLive) {
    const h = m.homeGoals ?? m.score?.homeGoals ?? 0;
    const a = m.awayGoals ?? m.score?.awayGoals ?? 0;
    let label = "1X";
    let code = "1X";
    if (h > a) {
      label = "П1";
      code = "П1";
    } else if (a > h) {
      label = "П2";
      code = "П2";
    }
    return {
      ...m,
      aiPick: {
        label,
        code,
        prob: null,
        tier: "B",
        family: "1x2",
        source: "live_score",
        odds: null,
        value: null,
        isTop: false,
      },
    };
  }
  // фаворит линии — слабый сигнал, чтобы лента не была пустой
  const odds = m.odds;
  if (odds?.p1 || odds?.p2) {
    const entries = [
      { label: "П1", code: "П1", o: odds.p1 },
      { label: "Х", code: "Х", o: odds.x },
      { label: "П2", code: "П2", o: odds.p2 },
    ].filter((e) => e.o && e.o > 1.01);
    if (entries.length) {
      entries.sort((a, b) => a.o - b.o);
      const best = entries[0];
      if (best.o <= 2.2) {
        const invSum = entries.reduce((s, e) => s + 1 / e.o, 0);
        const prob = Math.round(((1 / best.o) / invSum) * 1000) / 1000;
        const value = valueEdge(prob, best.o);
        return {
          ...m,
          aiPick: {
            label: best.label,
            code: best.code,
            prob,
            tier: value != null && value > 0.08 ? "A" : prob >= 0.55 ? "B" : "C",
            family: "1x2",
            source: "line_favorite",
            odds: best.o,
            value,
            isTop: value != null && value > 0.08,
          },
          isTop: value != null && value > 0.08,
        };
      }
    }
  }
  return { ...m, aiPick: null };
}

function mergeBoards(fourscore, stavkaMatches) {
  const out = [];
  const seen = new Set();

  const push = (row) => {
    const key = `${row.sport || "football"}|${row.home}|${row.away}`.toLowerCase();
    if (row.isLive) {
      const lk = `live|${key}`;
      if (seen.has(lk)) return;
      seen.add(lk);
    } else {
      if (seen.has(key)) return;
      seen.add(key);
    }
    out.push(row);
  };

  for (const m of fourscore.live || []) {
    push({
      ...m,
      odds: null,
      sport: m.sport || "football",
      sportLabel: m.sportLabel || "Футбол",
    });
  }
  for (const m of fourscore.matches || []) {
    const st = findByTeams(stavkaMatches, m.home, m.away);
    push({
      ...m,
      odds: st?.odds || null,
      stavkaKickoff: st?.kickoff || null,
      sport: m.sport || st?.sport || "football",
      sportLabel: m.sportLabel || st?.sportLabel || "Футбол",
    });
  }
  for (const st of stavkaMatches || []) {
    const exists = out.some(
      (r) =>
        !r.isLive &&
        (r.sport || "football") === (st.sport || "football") &&
        teamsSimilar(r.home, st.home) &&
        teamsSimilar(r.away, st.away),
    );
    if (exists) continue;
    push({
      home: st.home,
      away: st.away,
      kickoff: st.kickoff,
      league: st.league,
      odds: st.odds,
      source: "stavka",
      sport: st.sport || "football",
      sportLabel: st.sportLabel || "Футбол",
      isLive: false,
      minute: null,
      score: null,
    });
  }
  return out;
}

function slimBucket(bucket) {
  return {
    period: bucket.period,
    formatHint: bucket.formatHint || "",
    count: bucket.count,
    signalCount: bucket.signalCount,
    express: bucket.express,
    strategies: bucket.strategies || [],
    singles: bucket.singles || [],
    matches: bucket.matches,
  };
}

function emptyBucket(period) {
  return {
    period,
    formatHint: "",
    count: 0,
    signalCount: 0,
    express: null,
    strategies: [],
    singles: [],
    matches: [],
  };
}

function boardInsights(singles, expresses, learnInsights) {
  const lines = [...(learnInsights || [])];
  const tiers = { A: 0, B: 0, C: 0 };
  for (const s of singles || []) {
    const t = s.aiPick?.tier || "B";
    tiers[t] = (tiers[t] || 0) + 1;
  }
  if (tiers.A + tiers.B >= 8) {
    lines.push(
      `Плотный слой A/B (${tiers.A}A · ${tiers.B}B) — одинары сюда; в ×10+ только они`,
    );
  }
  const x10 = expresses?.["10"];
  if (x10?.total_odds) {
    lines.push(
      `×10 ~@${Number(x10.total_odds).toFixed(0)} · шанс ~${Math.round((x10.comboProb || 0) * 1000) / 10}% — зрелище, не банк`,
    );
  }
  const x30 = expresses?.["30"];
  if (x30?.total_odds) {
    lines.push("×20–×30: малая доля банка; edge — в одинарах по видам спорта");
  }
  return lines.slice(0, 5);
}

export async function loadBoard(force = false) {
  const IS_CLOUD = Boolean(process.env.RENDER);
  const enrichH2h = IS_CLOUD ? 12 : 40;
  const enrichFs = IS_CLOUD ? 12 : 40;
  const enrichExtra = IS_CLOUD ? 15 : 50;
  const cloudHint =
    "Источники (4score/Stavka) не отвечают с облачного сервера. Открой сайт через start.bat на домашнем ПК или Wi‑Fi ссылку.";

  const [fourscore, stavka, aiOut, forebet] = await Promise.all([
    fetchFourScoreBoard(),
    fetchStavkaMatches().catch(() => ({
      ok: false,
      matches: [],
      error: "Stavka fail",
    })),
    fetchFourScoreOutcomes().catch(() => ({
      ok: false,
      outcomes: [],
      count: 0,
      error: "AI fail",
    })),
    fetchForebetPredictions().catch(() => ({
      ok: false,
      matches: [],
      error: "Forebet fail",
    })),
  ]);

  if (!fourscore.ok && !(stavka.ok && stavka.matches?.length)) {
    return {
      ok: false,
      source: "4score + Stavka",
      matches: [],
      matchCount: 0,
      live: [],
      singles: [],
      expresses: { "10": null, "20": null, "30": null },
      singlesBySport: { football: [], tennis: [], hockey: [], basketball: [] },
      singlesArchiveBySport: { football: [], tennis: [], hockey: [], basketball: [] },
      singlesArchiveCount: 0,
      live: [],
      learn: { insights: [], rules: winningRules() },
      topCount: 0,
      live_matches: emptyBucket("live"),
      today_matches: emptyBucket("today"),
      three_days_matches: emptyBucket("3days"),
      week_matches: emptyBucket("week"),
      error: fourscore.error || stavka.error || (IS_CLOUD ? cloudHint : "Нет матчей"),
      historyMatches: 0,
    };
  }

  let index;
  let historyError = null;
  try {
    index = await getHistory(force);
  } catch (e) {
    historyError = e.message;
    index = { strengthByLeague: new Map(), csvTeams: new Set(), matchCount: 0 };
  }

  const merged = mergeBoards(fourscore, stavka.matches || []);
  const withOutcomes = attachOutcomesToMatches(merged, aiOut.outcomes || []);

  const now = new Date();
  let matches = withOutcomes.map((m) => {
    const analyzed = analyzeOne(m, index);
    return { ...analyzed, periods: tagMatchPeriods(analyzed, now) };
  });

  // Реальные очные 4score (прематч-футбол) → why + сдвиг пика
  try {
    matches = await enrichMatchesWithH2h(matches, { limit: enrichH2h });
  } catch {
    matches = matches.map((m) => ({ ...m, why: m.why || null, h2h: null }));
  }

  // Кубки / лиги вне CSV: средние голы со страницы 4score
  try {
    matches = await enrichMatchesWithFourscoreStats(matches, { limit: enrichFs });
  } catch {
    // ignore
  }

  try {
    matches = await enrichMatchesWithExtraStats(matches, { limit: enrichExtra });
  } catch {
    // ignore
  }

  // Профили + risk (если стата с 4score, а Пуассона не было)
  matches = matches.map((m) => {
    let row = m;
    if (
      row.homeProfile &&
      row.awayProfile &&
      !row.risk &&
      row.homeProfile.summary?.avgIT != null &&
      row.awayProfile.summary?.avgIT != null
    ) {
      const lam = Number(row.homeProfile.summary.avgIT) || 1.2;
      const mu = Number(row.awayProfile.summary.avgIT) || 1.1;
      row = attachRiskToMatch(row, lam, mu);
    }
    if (!row.homeProfile || !row.awayProfile) return row;
    const profilePick = pickFromProfiles(row.homeProfile, row.awayProfile, {
      odds: row.odds || {},
      risk: row.risk,
      h2h: row.h2h || null,
      homeName: row.home,
      awayName: row.away,
    });
    // факты 4score в why — только полезные тоталы (порог ~1.5–3.5)
    if (profilePick && row.fourscoreFacts?.length) {
      const extraWhy = row.fourscoreFacts.filter(isUsefulGoalFact).slice(0, 2);
      if (extraWhy.length) {
        profilePick.why = [...(profilePick.why || []), ...extraWhy];
      }
    }
    return profilePick ? { ...row, profilePick } : row;
  });

  matches.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? 1 : -1; // прематч выше
    const ha = a.h2h?.n ? 1 : 0;
    const hb = b.h2h?.n ? 1 : 0;
    if (ha !== hb) return hb - ha;
    return (b.aiPick?.prob || 0) - (a.aiPick?.prob || 0);
  });

  const { boost, insights: learnInsights } = getLearnBoosts();
  const live = buildLiveFeed(matches);
  const singles = buildSinglesFeed(matches, 120, boost);
  const singlesBySport = buildSinglesBySport(matches, 9999, boost);
  const singlesArchiveBySport = buildSinglesArchiveBySport(matches, 9999, boost);
  const archiveCount = Object.values(singlesArchiveBySport).reduce(
    (n, arr) => n + (arr?.length || 0),
    0,
  );
  const aCount = Object.values(singlesBySport).reduce(
    (n, arr) => n + (arr?.length || 0),
    0,
  );
  const expresses = buildExpressBySizes(matches, [10, 20, 30], boost);
  const singlesA = Object.values(singlesBySport).flat();
  const capperExpresses = buildCapperExpresses(matches, boost, singlesA);
  const safeExpress = buildSafeAccumulators(matches);
  const topToday = buildValueTopFeed(matches, { period: "today", limit: 40 });
  const top3days = buildValueTopFeed(matches, { period: "3days", limit: 50 });
  const topLive = buildValueTopFeed(matches, { period: "live", limit: 30 });
  let dropping = [];
  try {
    dropping = detectDroppingOdds(matches);
  } catch {
    dropping = [];
  }
  const h2hCount = matches.filter((m) => m.h2h?.n > 0).length;

  try {
    recordBoardPicks(topToday.slice(0, 40), live);
  } catch {
    /* disk optional */
  }

  const topCount = matches.filter((m) => m.isTop || m.aiPick?.isTop).length;
  const signalCount = topToday.length + top3days.length;
  const modeled = matches.filter((m) => m.model?.ok).length;
  const periodCounts = countByPeriod(matches, now);
  const periodExpresses = buildPeriodExpresses(matches, now);
  const buckets = buildAllPeriodBuckets(matches, now);

  const bySport = {};
  for (const m of matches) {
    if (m.isLive) continue;
    const s = m.sportLabel || "Спорт";
    bySport[s] = (bySport[s] || 0) + 1;
  }

  const sources = [
    fourscore.ok ? `4score ${fourscore.matchCount}` : null,
    stavka.ok ? `Stavka ${stavka.matches?.length || 0}` : null,
    aiOut.ok ? `AI ${aiOut.count}` : null,
  ].filter(Boolean);

  const insights = boardInsights(singles, expresses, learnInsights);
  insights.unshift(
    "ТОП = валуй >8% (P×кф−1). Safe Accumulator: P>70% · кф 1.45–1.90 · купон ~5–12",
  );

  return {
    ok: true,
    source: sources.join(" · ") || "4score + Stavka",
    sourceUrl: fourscore.sourceUrl || stavka.sourceUrl,
    matches,
    live,
    droppingOdds: dropping,
    topToday,
    top3days,
    topLive,
    singles,
    singlesBySport,
    singlesArchiveBySport,
    singlesCount: aCount,
    singlesArchiveCount: archiveCount,
    expresses,
    capperExpresses,
    safeExpress,
    express: safeExpress.today || expresses["10"] || null,
    highRiskExpress: generateHighRiskExpress(matches),
    highRiskExpresses: generateHighRiskExpressList(matches, 3),
    learn: {
      insights: insights.slice(0, 6),
      rules: [
        ...winningRules(),
        "ТОП только при валуе >8% — без «человеческих» догадок",
        "Прогруз линии: кф упал ≥10% между опросами → вкладка Лайв",
      ],
    },
    bySport,
    periodCounts,
    periodExpresses,
    live_matches: slimBucket(buckets.live_matches),
    today_matches: slimBucket(buckets.today_matches),
    three_days_matches: slimBucket(buckets.three_days_matches),
    week_matches: slimBucket(buckets.week_matches),
    matchCount: matches.length,
    liveCount: live.length,
    topCount,
    signalCount,
    modeledCount: modeled,
    aiOutcomeCount: aiOut.count || 0,
    h2hCount,
    droppingCount: dropping.length,
    pagesTried: stavka.pagesTried || 1,
    historyMatches: index.matchCount || 0,
    marketsWarning: stavka.marketsWarning || null,
    forebetStatus: forebet.ok
      ? `Forebet ok (${forebet.matches.length})`
      : `Forebet: ${forebet.error || "нет"}`,
    note:
      "Валуй от модели/AI×кф линии. Нет полного xG-завода и тиков всех БК — прогруз между нашими опросами.",
    error: historyError
      ? `История: ${historyError}. Матчи показаны без модели.`
      : null,
    warning:
      signalCount === 0
        ? "ТОПов с валуем >8% пока мало — обнови позже или смотри Safe."
        : null,
  };
}
