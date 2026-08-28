/**
 * Простое самообучение: журнал пиков + веса семейств исходов.
 * Не обещает прибыль — поднимает то, что чаще «сходилось» в журнале,
 * и формирует короткие выводы для UI.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "cache");
const FILE = resolve(DIR, "learn.json");

const DEFAULT = {
  picks: [],
  stats: {},
  insights: [],
  updatedAt: null,
};

function load() {
  try {
    if (!existsSync(FILE)) return structuredClone(DEFAULT);
    return { ...DEFAULT, ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

function save(data) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  data.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function keyOf(pick) {
  const fam = pick.family || "1x2";
  const tier = pick.tier || "B";
  return `${fam}|${tier}`;
}

/**
 * Записать текущие рекомендации в журнал (для будущей сверки).
 */
export function recordBoardPicks(singles, live) {
  const data = load();
  const now = Date.now();
  const add = (row, kind) => {
    if (!row?.aiPick?.label) return;
    const id = `${row.home}|${row.away}|${row.aiPick.label}|${kind}`;
    if (data.picks.some((p) => p.id === id && now - p.at < 6 * 3600_000)) return;
    data.picks.push({
      id,
      at: now,
      home: row.home,
      away: row.away,
      label: row.aiPick.label,
      family: row.aiPick.family || "1x2",
      tier: row.aiPick.tier || "B",
      sport: row.sport || "football",
      kind,
      result: null,
    });
  };
  for (const s of singles || []) add(s, "pre");
  for (const s of live || []) add(s, "live");
  // держим журнал компактным
  if (data.picks.length > 2000) data.picks = data.picks.slice(-1500);
  rebuildStats(data);
  save(data);
  return data;
}

/**
 * Пометить результат пика (hit/miss) — можно вызывать позже из сверки.
 */
export function markPickResult(id, hit) {
  const data = load();
  const p = data.picks.find((x) => x.id === id);
  if (!p) return data;
  p.result = hit ? "hit" : "miss";
  rebuildStats(data);
  save(data);
  return data;
}

function rebuildStats(data) {
  const stats = {};
  for (const p of data.picks) {
    if (p.result == null) continue;
    const k = keyOf(p);
    if (!stats[k]) stats[k] = { hit: 0, miss: 0, n: 0 };
    stats[k].n++;
    if (p.result === "hit") stats[k].hit++;
    else stats[k].miss++;
  }
  data.stats = stats;
  data.insights = buildInsights(stats, data.picks);
}

function buildInsights(stats, picks) {
  const lines = [];
  const ranked = Object.entries(stats)
    .map(([k, v]) => ({
      k,
      rate: v.n ? v.hit / v.n : 0,
      n: v.n,
    }))
    .filter((x) => x.n >= 5)
    .sort((a, b) => b.rate - a.rate);

  if (ranked[0]) {
    lines.push(
      `Лучше заходит: ${ranked[0].k.replace("|", " · ")} (${Math.round(ranked[0].rate * 100)}% из ${ranked[0].n})`,
    );
  }
  if (ranked.length > 1) {
    const worst = ranked[ranked.length - 1];
    if (worst.rate < 0.45) {
      lines.push(
        `Слабее: ${worst.k.replace("|", " · ")} (${Math.round(worst.rate * 100)}% из ${worst.n}) — реже в экспресс`,
      );
    }
  }

  const totals = picks.filter((p) => p.family === "total" && p.result != null);
  const ones = picks.filter((p) => p.family === "1x2" && p.result != null);
  if (totals.length >= 5 && ones.length >= 5) {
    const tr = totals.filter((p) => p.result === "hit").length / totals.length;
    const or_ = ones.filter((p) => p.result === "hit").length / ones.length;
    if (tr > or_ + 0.05) {
      lines.push("Тоталы в журнале стабильнее чистых П1/П2 — приоритет ТБ/ТМ в ×3–×5");
    } else if (or_ > tr + 0.05) {
      lines.push("1X2 в журнале стабильнее тоталов — в разгоне меньше комбо");
    }
  }

  if (!lines.length) {
    lines.push(
      "Журнал копится: после сверки результатов веса сами сместятся к более проходимым исходам",
    );
  }
  return lines.slice(0, 4);
}

/**
 * Бусты для сортировки ног: семейства с hit-rate выше — чуть выше.
 */
export function getLearnBoosts() {
  const data = load();
  const boost = {};
  for (const [k, v] of Object.entries(data.stats || {})) {
    if (v.n < 5) continue;
    const rate = v.hit / v.n;
    // −0.08 … +0.12 к «очкам» вероятности
    boost[k] = Math.max(-0.08, Math.min(0.12, (rate - 0.5) * 0.4));
    const fam = k.split("|")[0];
    boost[fam] = (boost[fam] || 0) + boost[k] * 0.3;
  }
  return { boost, insights: data.insights || [], stats: data.stats || {} };
}

/**
 * Эвристические «как делать победные кф» без обещания — правила отбора.
 */
export function winningRules() {
  return [
    "Edge в одинарах A/B (AI / очные / модель), не в линии «просто фаворит»",
    "×10–×30: без пересечения команд; кф ноги 1.35–2.30; C — минимум",
    "Длинный экспресс = малая доля банка; основной банк — одинары",
    "Валуй важнее красивого суммарного кф: без % — лотерея",
  ];
}
