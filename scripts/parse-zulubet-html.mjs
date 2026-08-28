import { readFileSync, writeFileSync } from "node:fs";

function parseTips(html) {
  const rows = [];
  const parts = html.split(/href="https:\/\/www\.zulubet\.com\/match-/i);
  for (let i = 1; i < parts.length && rows.length < 50; i++) {
    const id = (parts[i].match(/^(\d+)/) || [])[1];
    const teams = (parts[i].match(/\.html">([^<]+)</) || [])[1] || "";
    const [home, away] = teams.split(/\s+-\s+/).map((s) => String(s || "").trim());
    const block = parts[i].slice(0, 2800);
    const tipFull = (block.match(/class="[^"]*tip_full[^"]*"[^>]*>([^<]+)</i) || [])[1];
    const tipMin = (block.match(/class="[^"]*tip_min[^"]*"[^>]*>([^<]+)</i) || [])[1];
    const probs = {};
    for (const m of block.matchAll(/>\s*([12X]):\s*(\d+)%/gi)) {
      probs[m[1].toUpperCase()] = Number(m[2]);
    }
    // average odds columns often near aver_odds
    const oddsChunk = (block.match(/aver_odds[\s\S]{0,400}/i) || [""])[0];
    let odds = [...oddsChunk.matchAll(/>(\d+\.\d{2})</g)].map((m) => Number(m[1]));
    if (odds.length < 3) {
      odds = [...block.matchAll(/>(\d+\.\d{2})</g)]
        .map((m) => Number(m[1]))
        .filter((x) => x >= 1.01 && x <= 40)
        .slice(0, 3);
    }
    const prev = parts[i - 1] || "";
    const time = (prev.match(/mf_usertime\('([^']+)'\)/) || [])[1] || null;
    const flagTitle = (prev.match(/title="([^"]+)"/) || [])[1] || "";
    rows.push({
      id,
      home,
      away,
      league: flagTitle,
      tip: String(tipFull || tipMin || "").trim(),
      probs,
      odds: {
        p1: odds[0] || null,
        x: odds[1] || null,
        p2: odds[2] || null,
      },
      kickoffRaw: time,
      url: id ? `https://www.zulubet.com/match-${id}.html` : null,
    });
  }
  return rows.filter((r) => r.home && r.away);
}

const tips = readFileSync("scripts/_probe-zulubet-out/tips-27-08-2026.html", "utf8");
const home = readFileSync("scripts/_probe-zulubet-out/www_zulubet_com_.html", "utf8");
const a = parseTips(tips);
const b = parseTips(home);
writeFileSync("scripts/_probe-zulubet-out/parsed-tips.json", JSON.stringify(a, null, 2));
writeFileSync("scripts/_probe-zulubet-out/parsed-home.json", JSON.stringify(b.slice(0, 20), null, 2));
console.log(JSON.stringify({ tipsCount: a.length, homeCount: b.length, sample: a.slice(0, 6) }, null, 2));
