import { loadEnv } from "./lib/loadEnv.mjs";
loadEnv();

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBoard } from "./lib/analyze.mjs";
import { getPredictionsPipeline } from "./lib/dataAggregator.mjs";
import { rebuildCapperLevel } from "./lib/expressFeed.mjs";
import { settleExpresses } from "./lib/expressSettle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 3006;
const IS_CLOUD = Boolean(process.env.RENDER);

function slimCapperExpress(ex) {
  if (!ex || typeof ex !== "object") return null;
  return {
    id: ex.id || null,
    title: ex.title || null,
    subtitle: ex.subtitle || null,
    summary: ex.summary || null,
    recommendation: ex.recommendation || ex.summary || null,
    aiTitle: ex.aiTitle || null,
    aiReasoning: Array.isArray(ex.aiReasoning) ? ex.aiReasoning : [],
    total_odds: ex.total_odds ?? null,
    size: ex.size ?? null,
    matches: Array.isArray(ex.matches)
      ? ex.matches.map((l) => ({
          home: l.home,
          away: l.away,
          league: l.league || "",
          kickoff: l.kickoff || null,
          pick: l.pick || l.market || l.label || null,
          odds: l.odds ?? null,
          tier: l.tier || null,
          reason: l.reason || null,
          sportLabel: l.sportLabel || "",
        }))
      : [],
  };
}

/** Лёгкий ответ для UI — без полных списков матчей (~2 МБ → десятки КБ). */
function forClient(data) {
  if (!data || typeof data !== "object") return data;
  const {
    matches: _m,
    today_matches: _t,
    three_days_matches: _3,
    week_matches: _w,
    live_matches: _l,
    express: _ex,
    safeExpress: _s,
    highRiskExpresses: _h,
    periodExpresses: _p,
    topToday: _tt,
    top3days: _t3,
    topLive: _tl,
    live: _lv,
    droppingOdds: _d,
    learn: _learn,
    singles: _singles,
    highRiskExpress: _hr,
    ...rest
  } = data;

  /** Ужимаем экспресс до того, что нужно UI. */
  const slimExpress = (ex) => {
    if (!ex || typeof ex !== "object") return null;
    return {
      title: ex.title || null,
      total_odds: ex.total_odds ?? null,
      matches: Array.isArray(ex.matches)
        ? ex.matches.map((l) => ({
            home: l.home,
            away: l.away,
            league: l.league || "",
            kickoff: l.kickoff || null,
            pick: l.pick || l.market || l.label || null,
            odds: l.odds ?? null,
            sportLabel: l.sportLabel || "",
          }))
        : [],
    };
  };

  const raw = data.expresses || {};
  const expresses = {
    "10": slimExpress(raw["10"]),
    "20": slimExpress(raw["20"]),
    "30": slimExpress(raw["30"]),
  };

  const rawCapper = data.capperExpresses || {};
  const capperExpresses = {
    safe: slimCapperExpress(rawCapper.safe),
    medium: slimCapperExpress(rawCapper.medium),
    risky: slimCapperExpress(rawCapper.risky),
  };

  return {
    ...rest,
    singlesBySport: data.singlesBySport || {
      football: [],
      tennis: [],
      hockey: [],
      basketball: [],
    },
    singlesArchiveBySport: data.singlesArchiveBySport || {
      football: [],
      tennis: [],
      hockey: [],
      basketball: [],
    },
    expresses,
    capperExpresses,
    singlesCount: data.singlesCount ?? 0,
    singlesArchiveCount: data.singlesArchiveCount ?? 0,
    matchCount: data.matchCount ?? 0,
    topCount: data.topCount ?? 0,
    h2hCount: data.h2hCount ?? 0,
    bySport: data.bySport || null,
    ok: data.ok !== false,
    error: data.error || null,
    note: data.note || null,
    fromCache: data.fromCache,
    fetchedAt: data.fetchedAt,
  };
}

let cache = { at: 0, data: null, tier: null };
let inflightFast = null;
let inflightFull = null;
const CACHE_MS = 3 * 60 * 1000;

function emptyBoard(note = "Прогрев ленты…") {
  return {
    ok: true,
    warming: true,
    note,
    matchCount: 0,
    singlesCount: 0,
    singlesArchiveCount: 0,
    topCount: 0,
    singlesBySport: { football: [], tennis: [], hockey: [], basketball: [] },
    singlesArchiveBySport: { football: [], tennis: [], hockey: [], basketball: [] },
    expresses: { "10": null, "20": null, "30": null },
    capperExpresses: { safe: null, medium: null, risky: null },
    error: null,
  };
}

function send(res, code, body, type = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function wrapCached(data) {
  return {
    ...data,
    fromCache: true,
    fetchedAt: new Date(cache.at).toISOString(),
  };
}

async function rebuildBoard(force, tier = "full") {
  const data = await loadBoard(force, { tier });
  const payload = {
    ...data,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    warming: false,
    enrichTier: data.enrichTier || tier,
  };
  if (
    data.ok &&
    ((data.matches?.length || 0) > 0 ||
      (data.singlesCount || 0) > 0 ||
      (data.matchCount || 0) > 0)
  ) {
    if (tier === "full" || !cache.data || cache.tier !== "full") {
      cache = { at: Date.now(), data: payload, tier: payload.enrichTier || tier };
    }
  }
  return payload;
}

function kickRebuild(force = false, tier = "full") {
  const slot = tier === "fast" ? inflightFast : inflightFull;
  if (!slot) {
    const p = rebuildBoard(force, tier).finally(() => {
      if (tier === "fast") inflightFast = null;
      else inflightFull = null;
    });
    if (tier === "fast") inflightFast = p;
    else inflightFull = p;
    return p;
  }
  return slot;
}

function scheduleFullRebuild(force = false) {
  if (cache.tier === "full" && !force) return;
  kickRebuild(force, "full");
}

async function getBoard(force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) {
    if (IS_CLOUD && cache.tier !== "full") scheduleFullRebuild(false);
    return wrapCached(cache.data);
  }

  if (force) {
    return kickRebuild(true, IS_CLOUD ? "fast" : "full").then((fast) => {
      if (IS_CLOUD) scheduleFullRebuild(true);
      return fast;
    });
  }

  // В облаке сначала быстрая лента (~1 мин), полная догружается в фоне.
  if (IS_CLOUD && !cache.data) {
    try {
      const fast = await kickRebuild(false, "fast");
      scheduleFullRebuild(false);
      return fast;
    } catch {
      return emptyBoard("Прогрев ленты… подожди до 2 минут, страница обновится сама.");
    }
  }

  if (IS_CLOUD && cache.tier !== "full") {
    scheduleFullRebuild(false);
  } else {
    kickRebuild(false, "full");
  }

  if (cache.data) {
    return wrapCached(cache.data);
  }

  return emptyBoard("Прогрев ленты… обычно 30–90 сек, страница обновится сама.");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    send(
      res,
      200,
      JSON.stringify({
        ok: true,
        port: PORT,
        apiVersion: 2,
        features: { expressTake: true, expressReplace: true, expressSettle: true },
        matches: cache.data?.matchCount ?? 0,
        top: cache.data?.topCount ?? 0,
        warming: Boolean(
          (inflightFast && !cache.data) ||
            (inflightFull && cache.tier !== "full"),
        ),
        enrichTier: cache.tier || (inflightFast ? "fast" : null),
      }),
      "application/json; charset=utf-8",
    );
    return;
  }

  if (url.pathname === "/api/matches") {
    try {
      const force = url.searchParams.get("refresh") === "1";
      const data = await getBoard(force);
      send(res, 200, JSON.stringify(forClient(data)), "application/json; charset=utf-8");
    } catch (e) {
      send(
        res,
        200,
        JSON.stringify({
          ok: false,
          matches: [],
          matchCount: 0,
          topCount: 0,
          error: `Ошибка сервера: ${e.message}. Демо-матчей нет.`,
        }),
        "application/json; charset=utf-8",
      );
    }
    return;
  }

  if (url.pathname === "/api/express/take" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const level = body.level;
      if (!["safe", "medium", "risky"].includes(level)) {
        send(res, 400, JSON.stringify({ ok: false, error: "level: safe|medium|risky" }), "application/json; charset=utf-8");
        return;
      }
      const board = await getBoard(false);
      const singlesA = Object.values(board.singlesBySport || {}).flat();
      const excludeKeys = Array.isArray(body.excludeKeys) ? body.excludeKeys : [];
      const mustChangeKeys = Array.isArray(body.mustChangeKeys) ? body.mustChangeKeys : [];
      const replaceSeed = Number(body.replaceSeed) || 0;
      const coupon = rebuildCapperLevel(level, singlesA, excludeKeys, {
        mustChangeKeys,
        replaceSeed,
      });
      const slim = slimCapperExpress(coupon);
      send(
        res,
        200,
        JSON.stringify({ ok: Boolean(slim?.matches?.length), level, coupon: slim }),
        "application/json; charset=utf-8",
      );
    } catch (e) {
      send(res, 500, JSON.stringify({ ok: false, error: e.message }), "application/json; charset=utf-8");
    }
    return;
  }

  if (url.pathname === "/api/express/replace" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const level = body.level;
      if (!["safe", "medium", "risky"].includes(level)) {
        send(res, 400, JSON.stringify({ ok: false, error: "level: safe|medium|risky" }), "application/json; charset=utf-8");
        return;
      }
      const board = await getBoard(false);
      const singlesA = Object.values(board.singlesBySport || {}).flat();
      const excludeKeys = Array.isArray(body.excludeKeys) ? body.excludeKeys : [];
      const previousKeys = Array.isArray(body.previousKeys)
        ? body.previousKeys
        : Array.isArray(body.mustChangeKeys)
          ? body.mustChangeKeys
          : [];
      const minChangedLegs = Number(body.minChangedLegs) || (previousKeys.length ? 1 : 0);
      const replaceSeed = Number(body.replaceSeed) || 0;
      const coupon = rebuildCapperLevel(level, singlesA, excludeKeys, {
        previousKeys,
        minChangedLegs,
        replaceSeed,
      });
      const slim = slimCapperExpress(coupon);
      send(
        res,
        200,
        JSON.stringify({
          ok: Boolean(slim?.matches?.length),
          level,
          coupon: slim,
          partial: Boolean(coupon?._partialReplace),
          changedLegs: coupon?._changedLegs ?? 0,
          totalLegs: slim?.matches?.length ?? 0,
        }),
        "application/json; charset=utf-8",
      );
    } catch (e) {
      send(res, 500, JSON.stringify({ ok: false, error: e.message }), "application/json; charset=utf-8");
    }
    return;
  }

  if (url.pathname === "/api/express/settle" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const expresses = Array.isArray(body.expresses) ? body.expresses : [];
      const board = cache.data || (await getBoard(false));
      const matches = board.matches || [];
      const updated = settleExpresses(expresses, matches);
      send(res, 200, JSON.stringify({ ok: true, expresses: updated }), "application/json; charset=utf-8");
    } catch (e) {
      send(res, 500, JSON.stringify({ ok: false, error: e.message }), "application/json; charset=utf-8");
    }
    return;
  }

  if (url.pathname === "/api/v1/predictions") {
    try {
      const includeSkip = url.searchParams.get("include_skip") === "1";
      const bankroll = Number(url.searchParams.get("bankroll")) || 100;
      const result = await getPredictionsPipeline(process.env.ODDS_API_KEY, {
        includeSkip,
        bankroll,
        kellyFraction: 0.1,
      });
      const code = result.status === "success" ? 200 : 503;
      send(res, code, JSON.stringify(result), "application/json; charset=utf-8");
    } catch (e) {
      send(
        res,
        500,
        JSON.stringify({
          status: "error",
          timestamp: new Date().toISOString(),
          data: [],
          error: e.message || String(e),
        }),
        "application/json; charset=utf-8",
      );
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const file = resolve(ROOT, "public/index.html");
    if (!existsSync(file)) {
      send(res, 404, "index.html не найден");
      return;
    }
    send(res, 200, readFileSync(file), "text/html; charset=utf-8", {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    });
    return;
  }

  send(res, 404, "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`express-agent: http://0.0.0.0:${PORT}/ (cloud=${IS_CLOUD})`);
});

// Прогрев в фоне (не блокирует первый запрос UI)
if (IS_CLOUD) {
  kickRebuild(true, "fast")
    .then(() => scheduleFullRebuild(true))
    .then(() =>
      console.log(
        `прогрев full: матчей ${cache.data?.matchCount ?? 0}, A ${cache.data?.singlesCount ?? 0}`,
      ),
    )
    .catch((e) => console.warn("прогрев:", e.message));
} else {
  kickRebuild(true, "full")
    .then((d) =>
      console.log(
        `прогрев: матчей ${d.matchCount}, модель ${d.modeledCount ?? 0}, ТОП ${d.topCount ?? 0}, A ${d.singlesCount ?? 0}, история ${d.historyMatches ?? 0}`,
      ),
    )
    .catch((e) => console.warn("прогрев:", e.message));
}
