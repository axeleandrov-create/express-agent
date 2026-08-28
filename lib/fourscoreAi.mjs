/**
 * Исходы 4score ML (POST /ai/get/) — без обязательных кф.
 */

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function parseKickoffRu(raw) {
  const m = String(raw || "")
    .trim()
    .match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh) - 3, Number(min)),
  ).toISOString();
}

function shortOutcome(pick) {
  const t = String(pick || "").toLowerCase();
  if (/тотал.*больше\s*1\.5|больше\s*1\.5/.test(t)) return "ТБ 1.5";
  if (/тотал.*больше\s*2\.5|больше\s*2\.5/.test(t)) return "ТБ 2.5";
  if (/тотал.*больше\s*3\.5|больше\s*3\.5/.test(t)) return "ТБ 3.5";
  if (/тотал.*меньше\s*2\.5|меньше\s*2\.5/.test(t)) return "ТМ 2.5";
  if (/тотал.*меньше\s*1\.5|меньше\s*1\.5/.test(t)) return "ТМ 1.5";
  if (/оба.*забь|оз|btts/.test(t)) return "ОЗ";
  if (/победа\s*1|п1|home win|win1/.test(t)) return "П1";
  if (/победа\s*2|п2|away win|win2/.test(t)) return "П2";
  if (/ничь|draw|х\b/.test(t)) return "Х";
  if (/1x|не проиграют хозя/.test(t)) return "1X";
  if (/x2|не проиграют гост/.test(t)) return "X2";
  // укоротить длинный текст
  return String(pick || "—")
    .replace(/тотал голов\s*/i, "Т")
    .replace(/больше/i, "Б")
    .replace(/меньше/i, "М")
    .slice(0, 18);
}

function marketFamily(code) {
  if (["П1", "П2", "Х", "1X", "X2"].includes(code)) return "1x2";
  if (/^Т[БМ]/.test(code) || code === "ОЗ") return "total";
  return "other";
}

function tierFromProb(prob, code) {
  const p = Number(prob) || 0;
  if (
    p >= 0.65 &&
    (["1X", "X2", "ТБ 1.5"].includes(code) || (code === "П1" && p >= 0.6))
  ) {
    return "A";
  }
  if (p >= 0.5) return "B";
  return "C";
}

async function postAi(filters) {
  const body = new URLSearchParams({
    "filters[dates]": ymd(),
    "filters[confidence]": "interval",
    "filters[extra][confidence][interval][from]": "10",
    "filters[extra][confidence][interval][to]": "100",
    "filters[probability]": "interval",
    "filters[extra][probability][interval][from]": "30",
    "filters[extra][probability][interval][to]": "100",
    "filters[rate]": "interval",
    "filters[extra][rate][interval][from]": "1.01",
    "filters[extra][rate][interval][to]": "12",
    "filters[bookmaker]": "35",
    "filters[roi]": "all",
    "filters[events_count]": "all",
    ...filters,
  });

  const res = await fetch("https://4score.ru/ai/get/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: "https://4score.ru/",
      Accept: "text/html,*/*",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(25_000),
  });
  const html = await res.text();
  return { ok: res.ok, status: res.status, html };
}

function parseMlHtml(html, marketHint) {
  const rows = [];
  for (const block of html.split('class="ml"').slice(1)) {
    const teams = [...block.matchAll(/class="ml__team">([^<]+)/g)].map((m) =>
      m[1].trim(),
    );
    if (teams.length < 2) continue;

    const pickRaw =
      block.match(/ml__top-title[\s\S]*?<span>([^<]+)<\/span>/)?.[1]?.trim() ||
      "";
    const label = shortOutcome(pickRaw || marketHint);
    const pMatch = block.match(/\bP:\s*([\d.]+)\s*%/i);
    const cMatch = block.match(/\bC:\s*([\d.]+)\s*%/i);
    const prob = pMatch ? Number(pMatch[1]) / 100 : null;
    const confidence = cMatch ? Number(cMatch[1]) / 100 : null;
    if (prob == null || prob < 0.35) continue;

    const dateRaw = block.match(/class="ml__date">([^<]+)/)?.[1]?.trim();
    const kickoff = parseKickoffRu(dateRaw);
    const league =
      block.match(/class="ml__h-text">([^<]+)/)?.[1]?.trim() || "4score AI";

    const oddsModel = Number(
      block.match(/ml__score"[^>]*style="[^"]*3dc18d[^"]*"[^>]*>([0-9.]+)/)?.[1],
    );
    const oddsBook = Number(
      block.match(/class="ml__score">([0-9.]+)</)?.[1],
    );

    rows.push({
      home: teams[0],
      away: teams[1],
      kickoff,
      league,
      pick: pickRaw || label,
      label,
      code: label,
      family: marketFamily(label),
      prob: Math.round(prob * 1000) / 1000,
      confidence: confidence != null ? Math.round(confidence * 1000) / 1000 : null,
      odds: Number.isFinite(oddsBook) ? oddsBook : null,
      modelOdds: Number.isFinite(oddsModel) ? oddsModel : null,
      oddsSource: "4score_ai",
      source: "4score_ai",
      tier: tierFromProb(prob, label),
    });
  }
  return rows;
}

const QUERIES = [
  {
    hint: "П1",
    filters: {
      "filters[market_id]": "1",
      "filters[market_type]": "win1",
      "filters[argument]": "all",
    },
  },
  {
    hint: "П2",
    filters: {
      "filters[market_id]": "1",
      "filters[market_type]": "win2",
      "filters[argument]": "all",
    },
  },
  {
    hint: "Х",
    filters: {
      "filters[market_id]": "1",
      "filters[market_type]": "draw",
      "filters[argument]": "all",
    },
  },
  {
    hint: "ТБ",
    filters: {
      "filters[market_id]": "5",
      "filters[market_type]": "total_more",
      "filters[argument]": "interval",
      "filters[extra][argument][interval][from]": "1.5",
      "filters[extra][argument][interval][to]": "3.5",
    },
  },
  {
    hint: "ТМ",
    filters: {
      "filters[market_id]": "5",
      "filters[market_type]": "total_less",
      "filters[argument]": "interval",
      "filters[extra][argument][interval][from]": "1.5",
      "filters[extra][argument][interval][to]": "3.5",
    },
  },
  {
    hint: "1X",
    filters: {
      "filters[market_id]": "1",
      "filters[market_type]": "1x",
      "filters[argument]": "all",
    },
  },
  {
    hint: "X2",
    filters: {
      "filters[market_id]": "1",
      "filters[market_type]": "x2",
      "filters[argument]": "all",
    },
  },
];

/**
 * Тянет разные исходы с 4score AI.
 */
export async function fetchFourScoreOutcomes() {
  const all = [];
  const seen = new Set();
  let lastError = null;
  let pagesOk = 0;

  for (const q of QUERIES) {
    try {
      const { ok, html, status } = await postAi(q.filters);
      if (!ok || !html) {
        lastError = `HTTP ${status}`;
        continue;
      }
      pagesOk++;
      for (const row of parseMlHtml(html, q.hint)) {
        const key = `${row.home}|${row.away}|${row.label}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  all.sort((a, b) => (b.prob || 0) - (a.prob || 0));

  return {
    ok: pagesOk > 0,
    source: "4score_ai",
    outcomes: all,
    count: all.length,
    error: all.length ? null : lastError || "пустой ответ AI",
  };
}

export function attachOutcomesToMatches(matches, outcomes) {
  const byPair = new Map();
  for (const o of outcomes || []) {
    const key = `${o.home}|${o.away}`.toLowerCase();
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(o);
  }

  return (matches || []).map((m) => {
    const list =
      byPair.get(`${m.home}|${m.away}`.toLowerCase()) ||
      fuzzyOutcomes(m, outcomes);
    const sorted = [...list].sort((a, b) => (b.prob || 0) - (a.prob || 0));
    const aiPick = sorted[0]
      ? {
          label: sorted[0].label,
          code: sorted[0].code,
          prob: sorted[0].prob,
          tier: sorted[0].tier,
          family: sorted[0].family,
          source: sorted[0].source,
          odds: sorted[0].odds,
        }
      : null;
    return { ...m, outcomes: sorted, aiPick };
  });
}

function fuzzyOutcomes(m, outcomes) {
  const nh = norm(m.home);
  const na = norm(m.away);
  if (!nh || !na) return [];
  return (outcomes || []).filter((o) => {
    const oh = norm(o.home);
    const oa = norm(o.away);
    return (
      (oh.includes(nh) || nh.includes(oh)) &&
      (oa.includes(na) || na.includes(oa))
    );
  });
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "");
}
