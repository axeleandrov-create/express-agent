/**
 * Разведка Understat JSON API.
 * node scripts/probe-understat.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "_probe-understat-out");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function get(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      Referer: "https://understat.com/",
      Origin: "https://understat.com",
    },
    redirect: "follow",
  });
  const text = await r.text();
  return { status: r.status, text, url: r.url };
}

const season = 2025; // 2025/26
const leagues = ["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1"];

for (const league of leagues.slice(0, 2)) {
  const urls = [
    `https://understat.com/getLeagueData/${league}/${season}`,
    `https://understat.com/league/${league}/${season}`,
  ];
  for (const url of urls) {
    const res = await get(url);
    const name = `${league}-${url.includes("getLeague") ? "api" : "html"}`;
    writeFileSync(resolve(OUT, `${name}.txt`), res.text.slice(0, 200_000), "utf8");
    console.log(name, res.status, res.text.length, res.text.slice(0, 120).replace(/\s+/g, " "));
    // try parse json
    try {
      const j = JSON.parse(res.text);
      const keys = Object.keys(j);
      console.log("  json keys", keys.slice(0, 10));
      if (j.teams) console.log("  teams", Object.keys(j.teams || j.teams).length || Array.isArray(j.teams) && j.teams.length);
      if (j.dates) console.log("  dates", Array.isArray(j.dates) ? j.dates.length : typeof j.dates);
    } catch {
      const m = res.text.match(/teamsData\s*=\s*JSON\.parse\('([^']+)'\)/);
      console.log("  teamsData embed?", Boolean(m), m ? m[1].slice(0, 80) : "");
    }
  }
}
