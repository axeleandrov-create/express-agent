/**
 * Sports-AI стиль: Dropping Odds.
 * Сравниваем кф между опросами доски; падение ≥10% → сигнал «Прогруз линии!».
 * Не тики БК в реальном времени — снимок Stavka/пика между refresh.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "cache");
const FILE = resolve(DIR, "odds-snap.json");
const DROP_PCT = 0.1; // 10%

function loadSnap() {
  try {
    if (!existsSync(FILE)) return { at: 0, odds: {} };
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return { at: 0, odds: {} };
  }
}

function saveSnap(data) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data), "utf8");
}

function keyOf(m, label) {
  return `${m.sport || "football"}|${m.home}|${m.away}|${label}`.toLowerCase();
}

function extractOddsPoints(m) {
  const pts = [];
  if (m.odds?.p1) pts.push({ label: "П1", odds: m.odds.p1 });
  if (m.odds?.x) pts.push({ label: "Х", odds: m.odds.x });
  if (m.odds?.p2) pts.push({ label: "П2", odds: m.odds.p2 });
  if (m.aiPick?.odds && m.aiPick?.label) {
    pts.push({ label: m.aiPick.label, odds: m.aiPick.odds });
  }
  return pts;
}

/**
 * Обновить снимок и вернуть список сигналов прогрузки.
 */
export function detectDroppingOdds(matches) {
  const prev = loadSnap();
  const nextOdds = {};
  const signals = [];
  const now = Date.now();

  for (const m of matches || []) {
    for (const pt of extractOddsPoints(m)) {
      const k = keyOf(m, pt.label);
      nextOdds[k] = pt.odds;
      const old = prev.odds?.[k];
      if (!(old > 1.01) || !(pt.odds > 1.01)) continue;
      const drop = (old - pt.odds) / old;
      if (drop >= DROP_PCT) {
        signals.push({
          home: m.home,
          away: m.away,
          league: m.league,
          sport: m.sport || "football",
          sportLabel: m.sportLabel || "Футбол",
          isLive: Boolean(m.isLive),
          label: pt.label,
          oddsWas: Math.round(old * 100) / 100,
          oddsNow: Math.round(pt.odds * 100) / 100,
          dropPct: Math.round(drop * 1000) / 10,
          tag: "Прогруз линии!",
          minute: m.minute || null,
          score: m.score || null,
          line: `${pt.label} @ ${pt.odds.toFixed(2)} | ${m.home} — ${m.away} | было ${old.toFixed(2)} → −${Math.round(drop * 100)}% | Прогруз линии!`,
        });
      }
    }
  }

  saveSnap({ at: now, odds: nextOdds });
  signals.sort((a, b) => b.dropPct - a.dropPct);
  return signals.slice(0, 40);
}
