/**
 * Zulubet — прогнозы и средние кф с https://www.zulubet.com/
 * Шаг 2: модуль + дисковый кэш. Пик ленты / UI не трогает.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./fetch.mjs";
import { findByTeams, bestFuzzyMatch } from "./names.mjs";
import { valueEdge } from "./value.mjs";
import { impliedDoubleChanceOdds } from "./poisson.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = resolve(ROOT, "cache");
const CACHE_FILE = resolve(CACHE_DIR, "zulubet.json");
const CACHE_MS = 45 * 60_000;

const HOME_URL = "https://www.zulubet.com/";

function parseKickoff(raw) {
  // "08/27/2026, 13:30" — локаль сайта; храним ISO если получится (как UTC-наивное)
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  const y = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseOddsFromBlock(block) {
  const min = block.match(
    /aver_odds_min[^>]*>\s*1:\s*([\d.]+)\s*<br\s*\/?>\s*X:\s*([\d.]+)\s*<br\s*\/?>\s*2:\s*([\d.]+)/i,
  );
  if (min) {
    return {
      p1: Number(min[1]) || null,
      x: Number(min[2]) || null,
      p2: Number(min[3]) || null,
    };
  }
  const full = [...block.matchAll(/class="[^"]*aver_odds_full[^"]*"[^>]*>([\d.]+)</gi)].map((m) =>
    Number(m[1]),
  );
  if (full.length >= 3) {
    return { p1: full[0] || null, x: full[1] || null, p2: full[2] || null };
  }
  return { p1: null, x: null, p2: null };
}

function parseTip(block) {
  const green = block.match(/color:\s*green[^>]*>\s*<b>\s*([^<]+)\s*<\/b>/i);
  if (green) return String(green[1]).trim().toUpperCase();
  const tipFull = block.match(/class="[^"]*tip_full[^"]*"[^>]*>\s*([^<]+)/i);
  if (tipFull) return String(tipFull[1]).trim().toUpperCase();
  return null;
}

function parseProbs(block) {
  const probs = { home: null, draw: null, away: null };
  for (const m of block.matchAll(/>\s*([12X]):\s*(\d+)\s*%/gi)) {
    const k = m[1].toUpperCase();
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    if (k === "1") probs.home = v / 100;
    else if (k === "X") probs.draw = v / 100;
    else if (k === "2") probs.away = v / 100;
  }
  return probs;
}

/**
 * Парсит таблицу tips с главной (или tips-DD-MM-YYYY.html).
 * @returns {Array<{id, home, away, league, kickoff, tip, probs, odds, url, source}>}
 */
export function parseZulubetHtml(html) {
  if (!html) return [];
  const rows = [];
  const parts = String(html).split(/href="(?:https:\/\/www\.zulubet\.com\/)?match-/i);

  for (let i = 1; i < parts.length; i++) {
    const id = (parts[i].match(/^(\d+)/) || [])[1];
    if (!id) continue;
    const teamsRaw = (parts[i].match(/\.html">([^<]+)</) || [])[1] || "";
    const [home, away] = teamsRaw.split(/\s+-\s+/).map((s) => String(s || "").trim());
    if (!home || !away) continue;

    const block = parts[i].slice(0, 3200);
    const prev = parts[i - 1] || "";
    const kickoffRaw = (prev.match(/mf_usertime\('([^']+)'\)/) || [])[1] || null;
    const league = (prev.match(/title="([^"]+)"/) || [])[1] || "";

    const odds = parseOddsFromBlock(block);
    const probs = parseProbs(block);
    const tip = parseTip(block);

    rows.push({
      id,
      home,
      away,
      league,
      kickoff: parseKickoff(kickoffRaw),
      kickoffRaw,
      tip,
      probs,
      odds,
      url: `https://www.zulubet.com/match-${id}.html`,
      source: "zulubet",
    });
  }

  // уникальные по id
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (!raw?.at || Date.now() - raw.at > CACHE_MS) return null;
    if (!Array.isArray(raw.matches)) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(matches) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        at: Date.now(),
        sourceUrl: HOME_URL,
        matchCount: matches.length,
        matches,
      }),
      "utf8",
    );
  } catch {
    // ignore
  }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchZulubetMatches(opts = {}) {
  if (!opts.force) {
    const hit = readCache();
    if (hit) {
      return {
        ok: hit.matches.length > 0,
        matches: hit.matches,
        matchCount: hit.matches.length,
        source: "Zulubet",
        sourceUrl: HOME_URL,
        fromCache: true,
        fetchedAt: new Date(hit.at).toISOString(),
        error: hit.matches.length ? null : "Zulubet кэш пуст",
      };
    }
  }

  const res = await fetchText(HOME_URL, { timeoutMs: 35000 });
  if (!res.ok) {
    const stale = (() => {
      try {
        if (!existsSync(CACHE_FILE)) return null;
        return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
      } catch {
        return null;
      }
    })();
    if (stale?.matches?.length) {
      return {
        ok: true,
        matches: stale.matches,
        matchCount: stale.matches.length,
        source: "Zulubet",
        sourceUrl: HOME_URL,
        fromCache: true,
        stale: true,
        fetchedAt: new Date(stale.at).toISOString(),
        error: `Zulubet HTTP ${res.status || res.error || "fail"} — отдан старый кэш`,
      };
    }
    return {
      ok: false,
      matches: [],
      matchCount: 0,
      source: "Zulubet",
      sourceUrl: HOME_URL,
      fromCache: false,
      error: res.error || `HTTP ${res.status}`,
    };
  }

  const matches = parseZulubetHtml(res.text);
  if (matches.length) writeCache(matches);

  return {
    ok: matches.length > 0,
    matches,
    matchCount: matches.length,
    source: "Zulubet",
    sourceUrl: HOME_URL,
    fromCache: false,
    fetchedAt: new Date().toISOString(),
    error: matches.length ? null : "Zulubet: таблица пуста / разметка сменилась",
  };
}

/** Найти матч Zulubet по именам (жёстко, потом мягкий fuzzy EN↔другие). */
export function findZulubetMatch(zulubetMatches, home, away) {
  const list = zulubetMatches || [];
  const direct = findByTeams(list, home, away);
  if (direct) return direct;

  let best = null;
  let bestScore = 0;
  for (const row of list) {
    const h = bestFuzzyMatch(home, [row.home], 0.58);
    const a = bestFuzzyMatch(away, [row.away], 0.58);
    if (!h?.name || !a?.name) continue;
    // обе стороны должны быть похожи — среднее одно не спасёт слабую
    const minSc = Math.min(Number(h.score), Number(a.score));
    const sc = (Number(h.score) + Number(a.score)) / 2;
    if (minSc < 0.62) continue;
    if (sc > bestScore) {
      bestScore = sc;
      best = row;
    }
  }
  return bestScore >= 0.68 ? best : null;
}

/**
 * Выбор исхода по вероятностям Zulubet + кф (валуй).
 * Tip (1/X/2/1X…) усиливает кандидата, но не без кф ≥ 1.33.
 */
export function pickFromZulubetProbs(z, lineOdds = {}) {
  const p = z?.probs;
  if (!p || p.home == null || p.draw == null || p.away == null) return null;

  const odds = {
    p1: Number(lineOdds.p1) > 1.01 ? Number(lineOdds.p1) : Number(z.odds?.p1) || null,
    x: Number(lineOdds.x) > 1.01 ? Number(lineOdds.x) : Number(z.odds?.x) || null,
    p2: Number(lineOdds.p2) > 1.01 ? Number(lineOdds.p2) : Number(z.odds?.p2) || null,
  };

  const cands = [];
  const push = (code, label, prob, odd) => {
    if (!(prob > 0.05) || !(Number(odd) > 1.01)) return;
    const value = valueEdge(prob, odd);
    cands.push({
      code,
      label,
      family: "1x2",
      prob: Math.round(prob * 1000) / 1000,
      odds: Number(odd),
      value,
      source: "zulubet",
    });
  };

  push("П1", "П1", p.home, odds.p1);
  push("П2", "П2", p.away, odds.p2);
  push("Х", "Х", p.draw, odds.x);

  const odd1x = impliedDoubleChanceOdds(odds, "1X");
  const oddX2 = impliedDoubleChanceOdds(odds, "X2");
  push("1X", "1X", p.home + p.draw, odd1x);
  push("X2", "X2", p.draw + p.away, oddX2);

  if (!cands.length) return null;

  const tip = String(z.tip || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const tipMap = {
    "1": "П1",
    "2": "П2",
    X: "Х",
    "1X": "1X",
    X2: "X2",
    "12": null,
  };
  const tipCode = tipMap[tip] ?? null;

  cands.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  let pick =
    (tipCode &&
      cands.find((c) => c.code === tipCode && Number(c.odds) >= 1.33 && c.prob >= 0.5)) ||
    cands.find((c) => Number(c.odds) >= 1.33 && c.prob >= 0.55) ||
    cands.find((c) => Number(c.odds) >= 1.33) ||
    cands[0];

  // чистую Х в основной почти не берём — 1X/X2
  if (pick?.code === "Х") {
    pick =
      cands.find((c) => (c.code === "1X" || c.code === "X2") && Number(c.odds) >= 1.33) ||
      pick;
  }

  if (!pick) return null;

  const tier =
    (pick.value != null && pick.value > 0.08) || pick.prob >= 0.65
      ? "A"
      : pick.prob >= 0.55
        ? "A"
        : "B";

  const pct = `${Math.round(p.home * 100)}/${Math.round(p.draw * 100)}/${Math.round(p.away * 100)}%`;
  return {
    ...pick,
    oddsSource: "zulubet",
    tier,
    isTop: tier === "A" && pick.value != null && pick.value > 0.05,
    reason: `Zulubet ${pct}${tip ? `, tip ${tip}` : ""}${
      pick.value != null ? `, валуй ${(pick.value * 100).toFixed(1)}%` : ""
    }.`,
  };
}

/** Стата с страницы match-*.html: ср. голы и тоталы команды. */
export function parseZulubetMatchDetail(html) {
  if (!html) return null;
  const blocks = [
    ...String(html).matchAll(
      /<h3>([^<]+)<\/h3>\s*<h4>Average Goals<\/h4>\s*<table class="uo_stats_table">([\s\S]*?)<\/table>([\s\S]*?)(?=<h3>|<\/div><\/div><div class="statbox"|$)/gi,
    ),
  ];
  const teams = [];
  for (const m of blocks.slice(0, 2)) {
    const name = String(m[1]).trim();
    const avgTable = m[2];
    const rest = m[3] || "";
    const avgM = avgTable.match(
      /<tr>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>([\d.]+)<\/td>\s*<\/tr>/i,
    );
    const uo = (rest.match(/<h4>Under\/Over<\/h4>\s*<table class="uo_stats_table">([\s\S]*?)<\/table>/i) || [])[1] || "";
    const uoPcts = [...uo.matchAll(/<td>(\d+)\s*%<\/td>/gi)].map((x) => Number(x[1]) / 100);
    // headers: 1.5- 1.5+ 2.5- 2.5+ 3.5- 3.5+
    teams.push({
      name,
      games: avgM ? Number(avgM[1]) : null,
      avgGoals: avgM ? Number(avgM[3]) : null,
      over15: uoPcts[1] ?? null,
      over25: uoPcts[3] ?? null,
      over35: uoPcts[5] ?? null,
      under25: uoPcts[2] ?? null,
    });
  }
  if (!teams.length) return null;
  return {
    home: teams[0] || null,
    away: teams[1] || null,
  };
}

/**
 * Догружает Average Goals / Over с карточек матчей (лимит, с паузой).
 */
export async function enrichZulubetMatchDetails(matches, opts = {}) {
  const limit = Math.min(opts.limit ?? 18, 30);
  const need = (matches || [])
    .filter((m) => m.zulubet?.url && !m.zulubet?.form)
    .slice(0, limit);

  for (let i = 0; i < need.length; i++) {
    const m = need[i];
    try {
      const res = await fetchText(m.zulubet.url, { timeoutMs: 20000 });
      if (!res.ok) continue;
      const form = parseZulubetMatchDetail(res.text);
      if (!form) continue;
      m.zulubet = { ...m.zulubet, form };
    } catch {
      // ignore one match
    }
    if (i < need.length - 1) await new Promise((r) => setTimeout(r, 120));
  }
  return matches;
}

/**
 * Вешает zulubet на матчи ленты: tip, probs 1/X/2, кф в дыры Stavka.
 * Выбор ставки — через pickFromZulubetProbs в analyze / profilePick.
 */
export function attachZulubet(matches, zulubetMatches) {
  if (!Array.isArray(matches) || !matches.length) return matches;
  return matches.map((m) => {
    const z = findZulubetMatch(zulubetMatches, m.home, m.away);
    if (!z) return { ...m, zulubet: m.zulubet ?? null };

    const prev = m.odds || {};
    const filled = { ...prev };
    let oddsPatched = false;
    if (!(Number(filled.p1) > 1.01) && Number(z.odds?.p1) > 1.01) {
      filled.p1 = z.odds.p1;
      oddsPatched = true;
    }
    if (!(Number(filled.x) > 1.01) && Number(z.odds?.x) > 1.01) {
      filled.x = z.odds.x;
      oddsPatched = true;
    }
    if (!(Number(filled.p2) > 1.01) && Number(z.odds?.p2) > 1.01) {
      filled.p2 = z.odds.p2;
      oddsPatched = true;
    }

    return {
      ...m,
      odds: filled,
      oddsSource: oddsPatched
        ? [...new Set([...(Array.isArray(m.oddsSource) ? m.oddsSource : m.oddsSource ? [m.oddsSource] : []), "zulubet"])]
        : m.oddsSource,
      zulubet: {
        tip: z.tip,
        probs: z.probs,
        odds: z.odds,
        url: z.url,
        id: z.id,
        league: z.league,
        source: "zulubet",
        oddsPatched,
      },
    };
  });
}

export { HOME_URL, CACHE_MS };
