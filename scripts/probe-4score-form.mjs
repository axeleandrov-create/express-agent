/**
 * Разведка: что есть на странице матча 4score (форма/стата).
 * Запуск: node scripts/probe-4score-form.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFourScoreBoard } from "../lib/fourscore.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "scripts/_probe-form-out");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

const KEYS = [
  "форма",
  "последн",
  "забил",
  "пропустил",
  "очн",
  "h2h",
  "xg",
  "владен",
  "удары",
  "в створ",
  "сери",
  "статистик",
  "WDL",
  "form-table",
  "last-matches",
];

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ru,en;q=0.8" },
    signal: AbortSignal.timeout(30000),
  });
  const html = await r.text();
  return { status: r.status, html };
}

function analyze(html) {
  const low = html.toLowerCase();
  const hits = KEYS.filter((k) => low.includes(k.toLowerCase()));
  const endpoints = [
    ...html.matchAll(/["'](\/(?:api|ajax|events)[^"']{4,100})["']/gi),
  ].map((m) => m[1]);
  const uniqueEp = [...new Set(endpoints)].slice(0, 20);
  return { hits, uniqueEp, len: html.length };
}

const board = await fetchFourScoreBoard();
const adult = (board.matches || []).filter(
  (m) =>
    m.href &&
    !/u1[89]|u19|u21|жен|women|\(ж\)/i.test(`${m.home} ${m.away} ${m.league || ""}`),
);

const samples = adult.slice(0, 5);
const report = [];

for (const m of samples) {
  const url = m.href.startsWith("http") ? m.href : `https://4score.ru${m.href}`;
  try {
    const { status, html } = await fetchHtml(url);
    const a = analyze(html);
    const slug = url.split("/").filter(Boolean).pop();
    writeFileSync(resolve(OUT, `4score-${slug}.html`), html, "utf8");

    // известный H2H endpoint
    let h2hOk = false;
    try {
      const hr = await fetch(`https://4score.ru/events/${slug}/h2h-stats/`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: url,
        },
        body: "",
        signal: AbortSignal.timeout(20000),
      });
      const ht = await hr.text();
      h2hOk = hr.ok && ht.includes("event-block");
      writeFileSync(resolve(OUT, `4score-h2h-${slug}.html`), ht.slice(0, 50000), "utf8");
    } catch {
      h2hOk = false;
    }

    report.push({
      home: m.home,
      away: m.away,
      league: m.league,
      status,
      len: a.len,
      hits: a.hits,
      endpoints: a.uniqueEp,
      h2hPostOk: h2hOk,
    });
    console.log(
      `${m.home} — ${m.away}: page ${status}/${a.len} hits=[${a.hits.join(",")}] h2h=${h2hOk}`,
    );
  } catch (e) {
    report.push({ home: m.home, away: m.away, error: e.message });
    console.log("FAIL", m.home, e.message);
  }
}

writeFileSync(resolve(OUT, "4score-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log("saved", OUT);
