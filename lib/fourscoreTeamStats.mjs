/**
 * Стата команд со страницы матча 4score («Показатели команд» + факты).
 * Нужна, когда football-data не знает лигу/имена (кубки, Швеция и т.п.).
 * Форма В/Н/П — со страницы команды /teams/{slug}/.
 */

import { fetchText } from "./fetch.mjs";
import { normalizeTeamName, teamsSimilar } from "./names.mjs";

const cache = new Map();
const teamFormCache = new Map();
const CACHE_MS = 30 * 60_000;
const TEAM_FORM_CACHE_MS = 6 * 3600_000;

function num(s) {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickMetric(metrics, ...needles) {
  if (!metrics) return null;
  for (const needle of needles) {
    if (metrics[needle]) return metrics[needle];
  }
  const low = needles.map((n) => String(n).toLowerCase());
  for (const [key, val] of Object.entries(metrics)) {
    const k = key.toLowerCase();
    if (low.some((n) => k.includes(n))) return val;
  }
  return null;
}

/** Углы, карточки, фолы — для блока статистики в карточке матча. */
export function buildExtraStatsFromMetrics(metrics) {
  const corners = pickMetric(
    metrics,
    "Угловые команды в среднем за матч",
    "угловые команды",
  );
  const cornersMatch = pickMetric(metrics, "Угловые в среднем за матч", "угловые в среднем");
  const yellowCards = pickMetric(
    metrics,
    "Желтых карточек в среднем за матч",
    "Желтые карточки в среднем за матч",
    "желтых карточек",
    "желтые карточки",
  );
  const redCards = pickMetric(
    metrics,
    "Красные карточки в среднем за матч",
    "красные карточки",
  );
  const fouls = pickMetric(metrics, "Фолы в среднем за матч", "фолы в среднем");
  const offsides = pickMetric(metrics, "Офсайды в среднем за матч", "офсайды");

  const out = {};
  if (corners?.home != null && corners?.away != null) out.corners = corners;
  if (cornersMatch?.home != null && cornersMatch?.away != null) {
    out.cornersMatch = cornersMatch;
  }
  if (yellowCards?.home != null && yellowCards?.away != null) {
    out.yellowCards = yellowCards;
  }
  if (redCards?.home != null && redCards?.away != null) out.redCards = redCards;
  if (fouls?.home != null && fouls?.away != null) out.fouls = fouls;
  if (offsides?.home != null && offsides?.away != null) out.offsides = offsides;
  return Object.keys(out).length ? out : null;
}

/**
 * Парсит блок «Показатели команд» и интересные факты.
 */
export function parseTeamIndicators(html) {
  if (!html) return null;
  const chunkStart = html.indexOf("Показатели команд");
  if (chunkStart < 0) return null;
  const chunk = html.slice(chunkStart, chunkStart + 12000);

  const header = chunk.match(
    /table__name">\s*Команда\s*<\/div>\s*<b>([^<]+)<\/b>\s*<b>([^<]+)<\/b>/i,
  );
  const home = header?.[1]?.trim() || null;
  const away = header?.[2]?.trim() || null;

  const metrics = {};
  for (const m of chunk.matchAll(
    /table__name">([^<]+)<\/div>\s*<b>([^<]*)<\/b>\s*<b>([^<]*)<\/b>/gi,
  )) {
    const key = m[1].replace(/\s+/g, " ").trim();
    if (/^команда$/i.test(key)) continue;
    metrics[key] = { home: num(m[2]), away: num(m[3]) };
  }

  const avgT = metrics["Голы в среднем за матч"];
  const avgIT = metrics["Голы команды в среднем за матч"];
  const avgITOpp = metrics["Голы противника в среднем за матч"];
  if (!avgIT && !avgT) return null;

  const facts = [];
  const factsIdx = html.indexOf("Интересные факты");
  const factsBlock =
    factsIdx >= 0 ? html.slice(factsIdx, factsIdx + 15000) : "";
  for (const m of factsBlock.matchAll(
    /table__trends">[\s\S]*?<div>([\s\S]*?)<\/div>\s*<\/div>/gi,
  )) {
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 20 && text.length < 220) facts.push(text);
    if (facts.length >= 6) break;
  }

  const slugs = extractTeamSlugsFromMatchHtml(html);

  return {
    home,
    away,
    avgT: { home: avgT?.home ?? null, away: avgT?.away ?? null },
    avgIT: { home: avgIT?.home ?? null, away: avgIT?.away ?? null },
    avgITOpp: { home: avgITOpp?.home ?? null, away: avgITOpp?.away ?? null },
    metrics,
    extraStats: buildExtraStatsFromMetrics(metrics),
    facts,
    homeSlug: slugs.home || null,
    awaySlug: slugs.away || null,
    source: "4score_page",
  };
}

/** slug команд из JSON на странице матча. */
export function extractTeamSlugsFromMatchHtml(html) {
  if (!html) return { home: null, away: null };
  const home =
    html.match(/"localteam":\{[^{}]*?"url":"([a-z0-9-]+)"/i)?.[1] || null;
  const away =
    html.match(/"visitorteam":\{[^{}]*?"url":"([a-z0-9-]+)"/i)?.[1] || null;
  return { home, away };
}

/**
 * Последние завершённые матчи со страницы /teams/{slug}/ → W/D/L (старые→новые).
 */
export function parseTeamFormFromHtml(html, teamName, max = 5) {
  if (!html || !teamName) return [];
  const newestFirst = [];
  for (const block of html.split('class="event-block"').slice(1)) {
    if (!/Завершено/i.test(block)) continue;
    const title =
      block.match(/class="event-name"[^>]*>([^<]+)/i)?.[1]?.trim() || "";
    const hs = Number(
      block.match(/event-score-localteam"[^>]*>\s*(\d+)/i)?.[1],
    );
    const as_ = Number(
      block.match(/event-score-visitorteam"[^>]*>\s*(\d+)/i)?.[1],
    );
    if (!title || !Number.isFinite(hs) || !Number.isFinite(as_)) continue;
    const parts = title.split(/\s+-\s+/);
    if (parts.length < 2) continue;
    const home = parts[0].trim();
    const away = parts[1].trim();
    let gf;
    let ga;
    if (teamsSimilar(home, teamName) || namesLooselyMatch(home, teamName)) {
      gf = hs;
      ga = as_;
    } else if (
      teamsSimilar(away, teamName) ||
      namesLooselyMatch(away, teamName)
    ) {
      gf = as_;
      ga = hs;
    } else continue;
    newestFirst.push(gf > ga ? "W" : gf < ga ? "L" : "D");
    if (newestFirst.length >= max) break;
  }
  return newestFirst.reverse();
}

function namesLooselyMatch(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

async function fetchTeamForm(slug, teamName) {
  if (!slug) return [];
  const key = `${slug}|${normalizeTeamName(teamName)}`;
  const cached = teamFormCache.get(key);
  if (cached && Date.now() - cached.at < TEAM_FORM_CACHE_MS) return cached.form;

  const url = `https://4score.ru/teams/${slug}/`;
  const res = await fetchText(url, {
    timeoutMs: 22000,
    headers: {
      Accept: "text/html",
      "Accept-Language": "ru,en;q=0.8",
    },
  });
  const form =
    res.ok && res.text
      ? parseTeamFormFromHtml(res.text, teamName, 5)
      : [];
  teamFormCache.set(key, { at: Date.now(), form });
  return form;
}

function fracApprox(rate, n = 10) {
  const hit = Math.max(0, Math.min(n, Math.round(rate * n)));
  return {
    hit,
    n,
    pct: Math.round((hit / n) * 100),
    label: `${hit}/${n}`,
  };
}

/**
 * Синтетический профиль из средних 4score → тот же формат, что teamProfile.
 */
export function profileFromAverages(name, avgIT, avgITOpp, avgT, {
  n = 10,
  form = [],
} = {}) {
  if (!(avgIT > 0) && !(avgT > 0)) return null;
  const it = avgIT > 0 ? avgIT : avgT / 2;
  const opp = avgITOpp > 0 ? avgITOpp : Math.max(0.5, (avgT || 2.5) - it);
  const tot = avgT > 0 ? avgT : it + opp;

  const itbRate = it >= 1.6 ? 0.9 : it >= 1.3 ? 0.8 : it >= 1.0 ? 0.7 : 0.55;
  const overRate = tot >= 3.2 ? 0.8 : tot >= 2.7 ? 0.65 : tot >= 2.3 ? 0.5 : 0.35;
  const bttsRate =
    it >= 1.2 && opp >= 1.2 ? 0.7 : it >= 1.0 && opp >= 1.0 ? 0.55 : 0.4;

  const formArr = Array.isArray(form)
    ? form.filter((x) => x === "W" || x === "D" || x === "L").slice(-5)
    : [];

  return {
    name,
    csvName: null,
    n,
    venue: "any",
    summary: {
      wins: formArr.filter((x) => x === "W").length,
      draws: formArr.filter((x) => x === "D").length,
      losses: formArr.filter((x) => x === "L").length,
      avgIT: Math.round(it * 100) / 100,
      avgITOpp: Math.round(opp * 100) / 100,
      avgT: Math.round(tot * 100) / 100,
      maxIT: null,
      minIT: null,
      maxITOpp: null,
      minITOpp: null,
    },
    betTable: {
      itb05: fracApprox(itbRate, n),
      btts: fracApprox(bttsRate, n),
      over15: fracApprox(Math.min(0.95, overRate + 0.2), n),
      over25: fracApprox(overRate, n),
      win: fracApprox(0.4, n),
      draw: fracApprox(0.25, n),
      loss: fracApprox(0.35, n),
    },
    games: [],
    form: formArr,
    fromAverages: true,
  };
}

export async function fetchFourscoreTeamStats(href) {
  if (!href) return null;
  const url = href.startsWith("http") ? href : `https://4score.ru${href}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const res = await fetchText(url, {
    timeoutMs: 22000,
    headers: {
      Accept: "text/html",
      "Accept-Language": "ru,en;q=0.8",
    },
  });
  if (!res.ok || !res.text || res.text.length < 2000) {
    const miss = null;
    cache.set(url, { at: Date.now(), data: miss });
    return miss;
  }
  const data = parseTeamIndicators(res.text);
  cache.set(url, { at: Date.now(), data });
  return data;
}

/**
 * Для матчей без football-data профиля — стата со страницы 4score.
 */
export async function enrichMatchesWithFourscoreStats(matches, { limit = 35 } = {}) {
  const need = (matches || [])
    .filter(
      (m) =>
        !m.isLive &&
        (m.sport || "football") === "football" &&
        (!m.homeProfile || m.homeProfile.fromAverages) &&
        (m.href || m.url),
    )
    .sort((a, b) => {
      const ao = a.odds?.p1 || a.odds?.p2 ? 1 : 0;
      const bo = b.odds?.p1 || b.odds?.p2 ? 1 : 0;
      return bo - ao;
    });
  const slice = need.slice(0, limit);
  const out = [...(matches || [])];

  for (const m of slice) {
    try {
      const stats = await fetchFourscoreTeamStats(m.href || m.url);
      if (!stats) continue;

      const [homeForm, awayForm] = await Promise.all([
        fetchTeamForm(stats.homeSlug, m.home),
        fetchTeamForm(stats.awaySlug, m.away),
      ]);

      const homeProfile = profileFromAverages(
        m.home,
        stats.avgIT.home,
        stats.avgITOpp.home,
        stats.avgT.home,
        { form: homeForm },
      );
      const awayProfile = profileFromAverages(
        m.away,
        stats.avgIT.away,
        stats.avgITOpp.away,
        stats.avgT.away,
        { form: awayForm },
      );
      if (!homeProfile || !awayProfile) continue;

      const idx = out.findIndex(
        (x) =>
          x === m ||
          (x.home === m.home && x.away === m.away && x.kickoff === m.kickoff),
      );
      if (idx < 0) continue;
      const prev = out[idx];
      const keepHome =
        prev.homeProfile &&
        !prev.homeProfile.fromAverages &&
        prev.homeProfile.form?.length
          ? prev.homeProfile
          : homeProfile;
      const keepAway =
        prev.awayProfile &&
        !prev.awayProfile.fromAverages &&
        prev.awayProfile.form?.length
          ? prev.awayProfile
          : awayProfile;

      out[idx] = {
        ...out[idx],
        homeProfile: keepHome,
        awayProfile: keepAway,
        fourscoreStats: stats,
        fourscoreFacts: stats.facts || prev.fourscoreFacts || [],
        extraStats: stats.extraStats || prev.extraStats || null,
      };
    } catch {
      // ignore one match
    }
  }
  return out;
}

/**
 * Углы / карточки / фолы со страницы матча 4score — для одинаров A (есть профиль football-data).
 */
export async function enrichMatchesWithExtraStats(matches, { limit = 50 } = {}) {
  const rank = (m) => {
    let s = m.aiPick?.prob || 0;
    if (m.aiPick?.tier === "A") s += 3;
    if (m.isTop || m.aiPick?.isTop) s += 2;
    if (m.profilePick?.main) s += 1;
    return s;
  };

  const targets = (matches || [])
    .filter(
      (m) =>
        !m.isLive &&
        (m.sport || "football") === "football" &&
        (m.href || m.url) &&
        !m.extraStats,
    )
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit);

  const out = [...(matches || [])];
  const conc = 4;

  for (let i = 0; i < targets.length; i += conc) {
    const chunk = targets.slice(i, i + conc);
    await Promise.all(
      chunk.map(async (m) => {
        try {
          const stats = await fetchFourscoreTeamStats(m.href || m.url);
          if (!stats?.extraStats) return;
          const idx = out.findIndex(
            (x) =>
              x.home === m.home && x.away === m.away && x.kickoff === m.kickoff,
          );
          if (idx < 0) return;
          out[idx] = { ...out[idx], extraStats: stats.extraStats };
        } catch {
          /* ignore */
        }
      }),
    );
  }

  return out;
}
