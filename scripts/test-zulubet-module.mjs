/**
 * Проверка шага 2: node scripts/test-zulubet-module.mjs
 */
import { fetchZulubetMatches, parseZulubetHtml } from "../lib/zulubet.mjs";
import { readFileSync, existsSync } from "node:fs";

const saved = "scripts/_probe-zulubet-out/www_zulubet_com_.html";
if (existsSync(saved)) {
  const rows = parseZulubetHtml(readFileSync(saved, "utf8"));
  console.log(
    JSON.stringify(
      {
        fromSavedHtml: rows.length,
        withTip: rows.filter((r) => r.tip).length,
        withOdds: rows.filter((r) => r.odds?.p1 && r.odds?.p2).length,
        sample: rows.slice(0, 3),
      },
      null,
      2,
    ),
  );
}

const live = await fetchZulubetMatches({ force: true });
console.log(
  JSON.stringify(
    {
      liveOk: live.ok,
      count: live.matchCount,
      fromCache: live.fromCache,
      error: live.error,
      sample: (live.matches || []).slice(0, 2).map((m) => ({
        home: m.home,
        away: m.away,
        tip: m.tip,
        odds: m.odds,
        probs: m.probs,
      })),
    },
    null,
    2,
  ),
);

const cached = await fetchZulubetMatches({ force: false });
console.log(JSON.stringify({ secondCallFromCache: cached.fromCache, count: cached.matchCount }));
