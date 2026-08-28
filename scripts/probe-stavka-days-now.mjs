import { fetchText } from "../lib/fetch.mjs";

function countRows(html) {
  return (html || "").split("MatchesRow match-row").length - 1;
}

const now = new Date();
const days = [];
for (let i = 0; i < 4; i++) {
  const t = new Date(now.getTime() + 3 * 3600_000 + i * 86400_000);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = t.getUTCFullYear();
  days.push(`${dd}-${mm}-${yyyy}`);
  days.push(`${yyyy}-${mm}-${dd}`);
}

const urls = [
  "https://stavka.tv/matches/soccer",
  ...days.map((d) => `https://stavka.tv/matches/soccer/${d}`),
  ...days.map((d) => `https://stavka.tv/matches/soccer?date=${d}`),
];

for (const u of urls) {
  const r = await fetchText(u, { timeoutMs: 20000 });
  const n = countRows(r.text || "");
  console.log(JSON.stringify({ path: u.replace("https://stavka.tv", ""), status: r.status, rows: n, len: (r.text || "").length }));
}
