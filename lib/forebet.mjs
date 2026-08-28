import { fetchText } from "./fetch.mjs";
import { findByTeams } from "./names.mjs";

const FOREBET_URLS = [
  "https://www.forebet.com/en/football/predictions",
  "https://www.forebet.com/en/football/predictions/1x2",
];

function parsePercents(chunk) {
  const fprc = [...chunk.matchAll(/class="fprc"[^>]*>([\s\S]*?)<\/div>/g)];
  if (fprc.length) {
    const nums = [...fprc[0][1].matchAll(/>(\d{1,2}(?:\.\d+)?)</g)].map((m) => Number(m[1]));
    if (nums.length >= 3) {
      const s = nums[0] + nums[1] + nums[2];
      if (s > 0) return { home: nums[0] / s, draw: nums[1] / s, away: nums[2] / s };
    }
  }

  const pcts = [...chunk.matchAll(/(\d{1,2})\s*%/g)].map((m) => Number(m[1]));
  if (pcts.length >= 3) {
    const s = pcts[0] + pcts[1] + pcts[2];
    if (s >= 80) return { home: pcts[0] / s, draw: pcts[1] / s, away: pcts[2] / s };
  }
  return null;
}

function parseTeams(chunk) {
  const fromClass = [...chunk.matchAll(/class="(?:tnmscn|homeTeam|awayTeam)[^"]*"[^>]*>([^<]+)/g)]
    .map((m) => m[1].trim())
    .filter((n) => n.length > 1);
  if (fromClass.length >= 2) return { home: fromClass[0], away: fromClass[1] };

  const links = [...chunk.matchAll(/<a[^>]+>([^<]{3,40})<\/a>/g)]
    .map((m) => m[1].trim())
    .filter((n) => !/prediction|stats|tip/i.test(n));
  if (links.length >= 2) return { home: links[0], away: links[1] };

  const m = chunk.match(
    /([A-Za-zÀ-ÿ0-9 .'\-]{3,40})\s*(?:vs|VS|–|-|—)\s*([A-Za-zÀ-ÿ0-9 .'\-]{3,40})/,
  );
  if (m) return { home: m[1].trim(), away: m[2].trim() };
  return null;
}

function parseHtml(html) {
  const chunks = html.split(/class="rcnt/).slice(1);
  const rows = [];
  const seen = new Set();

  for (const chunk of chunks.length ? chunks : [html]) {
    const teams = parseTeams(chunk);
    const probs = parsePercents(chunk);
    if (!teams || !probs) continue;
    const key = `${teams.home}|${teams.away}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      home: teams.home,
      away: teams.away,
      probs: {
        home: Math.round(probs.home * 1000) / 1000,
        draw: Math.round(probs.draw * 1000) / 1000,
        away: Math.round(probs.away * 1000) / 1000,
      },
      source: "forebet",
    });
  }

  return rows;
}

export async function fetchForebetPredictions() {
  let lastError = null;
  let httpStatus = 0;

  for (const url of FOREBET_URLS) {
    const res = await fetchText(url, {
      timeoutMs: 30_000,
      headers: { "Accept-Language": "en-US,en;q=0.9,ru;q=0.6" },
    });
    httpStatus = res.status;
    if (!res.ok || !res.text) {
      lastError = res.error || `HTTP ${res.status || 0}`;
      continue;
    }
    const matches = parseHtml(res.text);
    if (matches.length) {
      return {
        ok: true,
        source: "Forebet",
        sourceUrl: url,
        httpStatus,
        matches,
        error: null,
      };
    }
    lastError = "страница открылась, но проценты не найдены";
  }

  return {
    ok: false,
    source: "Forebet",
    sourceUrl: FOREBET_URLS[0],
    httpStatus,
    matches: [],
    error: `Forebet не отдал модель (${lastError || "пусто"}). Демо не подставляем.`,
  };
}

export function attachForebet(stavkaMatches, forebetMatches) {
  return stavkaMatches.map((row) => {
    const fb = findByTeams(forebetMatches, row.home, row.away);
    if (!fb) {
      return {
        ...row,
        forebet: null,
        modelLabel: "нет модели",
      };
    }
    return {
      ...row,
      forebet: {
        home: fb.home,
        away: fb.away,
        probs: fb.probs,
        source: "Forebet",
      },
      modelLabel: "Forebet",
    };
  });
}
