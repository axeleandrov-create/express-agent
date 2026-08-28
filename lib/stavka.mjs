import { fetchText } from "./fetch.mjs";

const STAVKA_BASE = "https://stavka.tv/matches/soccer";
/** Горизонт: 7 суток вперёд. */
const HORIZON_DAYS = 7;
const HORIZON_MS = HORIZON_DAYS * 24 * 3600_000;

const MONTHS_RU = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  май: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};

const LIVE_STATUS_RE =
  /^\d+['’′`]|доп\.?\s*время|перерыв|заверш|ft\b|live|лайв/i;

const SPORTS = [
  { path: "/matches/soccer", sport: "football", label: "Футбол" },
  { path: "/matches/ice-hockey", sport: "hockey", label: "Хоккей" },
  { path: "/matches/basketball", sport: "basketball", label: "Баскетбол" },
  { path: "/matches/tennis", sport: "tennis", label: "Теннис" },
];

/** Разворот Nuxt/devalue payload из <script type="application/json">. */
function reviveNuxt(raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return data;
  const cache = new Map();
  function resolve(i, stack = new Set()) {
    if (typeof i !== "number") return i;
    if (cache.has(i)) return cache.get(i);
    if (stack.has(i)) return null;
    stack.add(i);
    const v = data[i];
    let out;
    if (v === null || typeof v !== "object") out = v;
    else if (Array.isArray(v)) {
      if (
        v[0] === "Reactive" ||
        v[0] === "ShallowReactive" ||
        v[0] === "Ref" ||
        v[0] === "ShallowRef"
      ) {
        out = resolve(v[1], stack);
      } else {
        out = v.map((x) => resolve(x, stack));
      }
    } else {
      out = {};
      for (const [k, val] of Object.entries(v)) out[k] = resolve(val, stack);
    }
    cache.set(i, out);
    stack.delete(i);
    return out;
  }
  return resolve(0);
}

function extractLargestJsonScript(html) {
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let best = "";
  let m;
  while ((m = re.exec(html || ""))) {
    if (m[1].length > best.length) best = m[1];
  }
  return best;
}

function oddVal(side) {
  const v = Number(side?.value);
  return v >= 1.01 ? v : null;
}

function rowFromPayloadMatch(m, tournament, sportMeta, now, horizon) {
  if (!m || m.isLive) return null;
  const home = m.teams?.home?.name;
  const away = m.teams?.away?.name;
  if (!home || !away) return null;

  const kickMs = m.matchDate ? new Date(m.matchDate).getTime() : NaN;
  if (!Number.isFinite(kickMs)) return null;
  if (kickMs <= now.getTime() || kickMs > horizon) return null;

  const ox = m.odds?.one_x_two;
  const odds = {
    p1: oddVal(ox?.w1),
    x: oddVal(ox?.x),
    p2: oddVal(ox?.w2),
  };
  if (!odds.p1 && !odds.x && !odds.p2) return null;

  const country = tournament?.country?.name || m.teams?.home?.country?.name || "";
  const leagueName = tournament?.name || "";
  const league = country ? `${country} · ${leagueName}` : leagueName || sportMeta.label;

  return {
    home,
    away,
    odds,
    kickoff: new Date(kickMs).toISOString(),
    league,
    sport: sportMeta.sport,
    sportLabel: sportMeta.label,
    source: "stavka",
    stavkaId: m.id || null,
  };
}

function extractRowsFromPayload(html, now, horizon, seen, sportMeta) {
  const raw = extractLargestJsonScript(html);
  if (!raw || raw.length < 1000) return { rows: [], total: 0, via: null };
  let root;
  try {
    root = reviveNuxt(raw);
  } catch {
    return { rows: [], total: 0, via: null };
  }
  const data = root?.data || {};
  const key = Object.keys(data).find((k) => k.startsWith("matchesPageAsyncData-/"));
  const page = key ? data[key] : null;
  if (!page?.matchesList) return { rows: [], total: 0, via: null };

  const rows = [];
  for (const tournament of page.matchesList) {
    for (const m of tournament.matches || []) {
      const row = rowFromPayloadMatch(m, tournament, sportMeta, now, horizon);
      if (!row) continue;
      const k = `${row.sport}|${row.home}|${row.away}|${row.kickoff}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(row);
    }
  }
  return {
    rows,
    total: Number(page.matchesTotal) || rows.length,
    via: "nuxt-payload",
  };
}

/** Время на Stavka HTML — часто МСК. */
function parseKickoffFromEvent(statusText, dateText, now) {
  const status = statusText.trim();
  if (!status || LIVE_STATUS_RE.test(status)) return null;

  const timeM = status.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeM) return null;

  const hour = Number(timeM[1]);
  const minute = Number(timeM[2]);
  const dateM = dateText.trim().match(/(\d{1,2})\s+([а-яё]+)/i);
  if (!dateM) return null;

  const day = Number(dateM[1]);
  const mon = MONTHS_RU[dateM[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;

  const year = now.getFullYear();
  let kick = new Date(Date.UTC(year, mon, day, hour - 3, minute));
  if (kick.getTime() < now.getTime() - 2 * 86400_000) {
    kick = new Date(Date.UTC(year + 1, mon, day, hour - 3, minute));
  }
  return kick.toISOString();
}

function parseRow(chunk, league, now, horizon) {
  if (/class="[^"]*event-status--past/.test(chunk)) return null;
  if (/class="[^"]*event-date--past/.test(chunk)) return null;
  if (/Завершен|>FT</i.test(chunk)) return null;

  const teams = [...chunk.matchAll(/class="team-name[^"]*"[^>]*>([^<]+)/g)].map(
    (m) => m[1].trim(),
  );
  if (teams.length < 2) return null;

  const statusText =
    chunk.match(/class="event-status"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  const dateText =
    chunk.match(/class="event-date"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";

  const kickoff = parseKickoffFromEvent(statusText, dateText, now);
  if (!kickoff) return null;

  const kickMs = new Date(kickoff).getTime();
  if (kickMs <= now.getTime() || kickMs > horizon) return null;

  const parseOdd = (title) => {
    const m = chunk.match(
      new RegExp(`title="${title}"[\\s\\S]*?<span class="odd"[^>]*>([0-9.]+)<`),
    );
    const v = m ? Number(m[1]) : null;
    return v && v >= 1.01 ? v : null;
  };

  const odds = {
    p1: parseOdd("Победа 1"),
    x: parseOdd("Ничья"),
    p2: parseOdd("Победа 2"),
  };
  if (!odds.p1 && !odds.x && !odds.p2) return null;

  return { home: teams[0], away: teams[1], odds, kickoff, league };
}

function splitLeagueSections(html) {
  const sections = [];
  const parts = html.split(/class="title-link"/);

  for (let i = 1; i < parts.length; i++) {
    const pre = parts[i - 1];
    const country =
      pre.match(/class="title-country[^"]*"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
    const leagueName =
      parts[i].match(/[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? "Футбол";
    const league = country ? `${country} · ${leagueName}` : leagueName;
    sections.push({ league, body: parts[i] });
  }

  if (!sections.length) {
    sections.push({ league: "Футбол", body: html });
  }

  return sections;
}

function extractRowsHtml(html, now, horizon, seen, sportMeta) {
  const rows = [];
  for (const { league, body } of splitLeagueSections(html)) {
    for (const chunk of body.split("MatchesRow match-row").slice(1)) {
      const row = parseRow(chunk, league, now, horizon);
      if (!row) continue;
      const key = `${sportMeta.sport}|${row.home}|${row.away}|${row.kickoff}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        ...row,
        sport: sportMeta.sport,
        sportLabel: sportMeta.label,
        source: "stavka",
      });
    }
  }
  return rows;
}

async function fetchHtml(url) {
  let lastError = null;
  let httpStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchText(url, { timeoutMs: 25_000 });
    httpStatus = res.status;
    if (res.ok && res.text) return { html: res.text, httpStatus, error: null };
    lastError = res.error || `HTTP ${res.status || 0}`;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return { html: "", httpStatus, error: lastError };
}

async function fetchSportPages(sportMeta, now, horizon, seen) {
  const collected = [];
  const tried = [];
  let lastHttp = 0;
  let lastError = null;
  let via = null;
  let totalHint = 0;

  // page 1 + page 2 (на Stavka вторая страница добирает остаток matchesTotal)
  for (const page of [1, 2]) {
    const url =
      page === 1
        ? `https://stavka.tv${sportMeta.path}`
        : `https://stavka.tv${sportMeta.path}?page=${page}`;
    const { html, httpStatus, error } = await fetchHtml(url);
    lastHttp = httpStatus || lastHttp;
    tried.push({ url, ok: Boolean(html), status: httpStatus });
    if (!html) {
      lastError = error;
      continue;
    }
    lastError = null;

    const fromPayload = extractRowsFromPayload(html, now, horizon, seen, sportMeta);
    if (fromPayload.rows.length) {
      via = fromPayload.via;
      totalHint = Math.max(totalHint, fromPayload.total);
      collected.push(...fromPayload.rows);
      // если всё уже в первой странице — вторую можно не ждать смысла, но page2 короткая
      if (page === 1 && fromPayload.rows.length >= fromPayload.total) break;
      continue;
    }

    // запасной HTML-парсер
    const htmlRows = extractRowsHtml(html, now, horizon, seen, sportMeta);
    if (htmlRows.length) {
      via = via || "html";
      collected.push(...htmlRows);
    }
  }

  return { rows: collected, tried, lastHttp, lastError, via, totalHint };
}

/** Прематч Stavka: Nuxt payload (основное) + HTML fallback. */
export async function fetchStavkaMatches() {
  const now = new Date();
  const horizon = now.getTime() + HORIZON_MS;
  const seen = new Set();
  const rows = [];
  const sourcesTried = [];
  let lastHttp = 0;
  let lastError = null;
  let viaBits = [];

  for (const sport of SPORTS) {
    const pack = await fetchSportPages(sport, now, horizon, seen);
    lastHttp = pack.lastHttp || lastHttp;
    sourcesTried.push(...pack.tried);
    if (pack.lastError && !pack.rows.length) lastError = pack.lastError;
    if (pack.via) viaBits.push(`${sport.sport}:${pack.via}`);
    rows.push(...pack.rows);
  }

  rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  if (!rows.length) {
    return {
      ok: false,
      source: "Stavka.TV",
      sourceUrl: STAVKA_BASE,
      httpStatus: lastHttp,
      matches: [],
      pagesTried: sourcesTried.length,
      error: lastError
        ? `Stavka.TV не ответил (${lastError}). Демо-матчей нет.`
        : "Stavka.TV открылся, но ближайших матчей нет.",
    };
  }

  return {
    ok: true,
    source: "Stavka.TV",
    sourceUrl: STAVKA_BASE,
    httpStatus: lastHttp,
    matches: rows,
    pagesTried: sourcesTried.length,
    matchCountRaw: rows.length,
    parseVia: viaBits.join(", ") || "unknown",
    error: null,
    marketsWarning:
      "Stavka payload: П1/Х/П2. Тоталы — 4score AI / модель. Виды: футбол, хоккей, баскетбол, теннис.",
  };
}
