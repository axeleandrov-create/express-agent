/**
 * Understat: cookies + getLeagueData / export.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function jarFetch(url, cookie = "") {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://understat.com/league/EPL/2025",
      Origin: "https://understat.com",
      "X-Requested-With": "XMLHttpRequest",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const set = r.headers.getSetCookie?.() || [];
  const text = await r.text();
  return { status: r.status, text, set, headers: Object.fromEntries(r.headers) };
}

const home = await jarFetch("https://understat.com/");
console.log("home", home.status, home.set?.slice?.(0, 3) || home.set);
let cookie = (home.set || [])
  .map((c) => String(c).split(";")[0])
  .filter(Boolean)
  .join("; ");
// also raw getSetCookie may not exist in node - try get('set-cookie')
if (!cookie) {
  const sc = home.headers["set-cookie"];
  console.log("set-cookie header", sc);
}

const urls = [
  "https://understat.com/getLeagueData/EPL/2025",
  "https://understat.com/getLeagueData/EPL/2024",
  "https://understat.com/getStatData",
  "https://understat.com/main/getLeagueData/EPL/2025",
  "https://understat.com/api/getLeagueData/EPL/2025",
];

for (const url of urls) {
  const res = await jarFetch(url, cookie);
  console.log("\n", url, res.status, res.text.length, res.text.slice(0, 150).replace(/\s+/g, " "));
}
