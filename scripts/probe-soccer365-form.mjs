/**
 * Разведка Soccer365: расписание на сегодня + намёки на форму.
 * Запуск: node scripts/probe-soccer365-form.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "scripts/_probe-form-out");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function todayParts() {
  const d = new Date();
  // МСК ≈ UTC+3
  const msk = new Date(d.getTime() + 3 * 3600_000);
  const y = msk.getUTCFullYear();
  const m = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const day = String(msk.getUTCDate()).padStart(2, "0");
  return { y, m, day, iso: `${y}-${m}-${day}` };
}

async function get(url, opts = {}) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ru",
      Accept: "text/html,application/json,*/*",
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(35000),
  });
  const text = await r.text();
  return { status: r.status, text, ok: r.ok };
}

const { iso } = todayParts();
const report = { date: iso, endpoints: [] };

const candidates = [
  `https://soccer365.ru/online/&date=${iso}`,
  `https://soccer365.ru/online/?date=${iso}`,
  `https://soccer365.ru/`,
  `https://soccer365.ru/ajax/games_data/?dt=${iso}`,
  `https://soccer365.ru/ajax/games_data/?date=${iso}`,
];

for (const url of candidates) {
  try {
    const res = await get(url, {
      headers: url.includes("ajax")
        ? { "X-Requested-With": "XMLHttpRequest", Referer: "https://soccer365.ru/" }
        : {},
    });
    const low = res.text.toLowerCase();
    const entry = {
      url,
      status: res.status,
      len: res.text.length,
      hasGames: /game|match|команд|счёт|vs/i.test(res.text),
      hasForm: /форма|последн|забил|сери/i.test(res.text),
      looksJson: res.text.trim().startsWith("{") || res.text.trim().startsWith("["),
      sample: res.text.slice(0, 200).replace(/\s+/g, " "),
    };
    report.endpoints.push(entry);
    const fname = url.replace(/https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
    writeFileSync(resolve(OUT, `s365-${fname}.txt`), res.text.slice(0, 200000), "utf8");
    console.log(url, res.status, res.text.length, "form?", entry.hasForm, "json?", entry.looksJson);
  } catch (e) {
    report.endpoints.push({ url, error: e.message });
    console.log("FAIL", url, e.message);
  }
}

// Если нашли id игры — ткнём страницу матча
const blob = report.endpoints.map((e) => e.sample || "").join("\n");
const gid =
  blob.match(/\/games\/(\d+)/)?.[1] ||
  report.endpoints
    .map((e) => {
      try {
        return (e.sample || "").match(/games\/(\d+)/)?.[1];
      } catch {
        return null;
      }
    })
    .find(Boolean);

if (gid) {
  const gameUrl = `https://soccer365.ru/games/${gid}/`;
  try {
    const res = await get(gameUrl);
    writeFileSync(resolve(OUT, `s365-game-${gid}.html`), res.text.slice(0, 300000), "utf8");
    const low = res.text.toLowerCase();
    report.game = {
      gid,
      status: res.status,
      len: res.text.length,
      hits: ["форма", "факт", "тренд", "последн", "забил", "пропустил", "очн"].filter((k) =>
        low.includes(k),
      ),
    };
    console.log("game", gid, report.game.hits);
  } catch (e) {
    report.game = { gid, error: e.message };
  }
}

writeFileSync(resolve(OUT, "s365-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log("saved", OUT);
