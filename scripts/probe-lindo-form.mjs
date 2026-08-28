/**
 * Probe 4score form endpoints for Lindo–Malmo.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";
const slug = "lindo-ff-malmyo-27-08-2026";
const base = `https://4score.ru/events/${slug}`;

async function tryReq(url, method = "GET") {
  try {
    const r = await fetch(url, {
      method,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ru",
        Referer: `${base}/`,
        ...(method === "POST"
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            }
          : {}),
      },
      signal: AbortSignal.timeout(25000),
      body: method === "POST" ? "" : undefined,
    });
    const t = await r.text();
    const low = t.toLowerCase();
    return {
      url,
      method,
      status: r.status,
      len: t.length,
      interesting: /форм|последн|забил|матч|1:0|0:1|h2h|score/i.test(low),
      sample: t.slice(0, 220).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { url, method, err: e.message };
  }
}

const paths = [
  "",
  "/",
  "/h2h-stats/",
  "/last-matches/",
  "/form/",
  "/stats/",
  "/team-form/",
  "/results/",
];

const out = [];
for (const p of paths) {
  const url = p === "" ? base : `${base}${p}`;
  out.push(await tryReq(url));
  if (p && p !== "/") out.push(await tryReq(url, "POST"));
}

const main = await (await fetch(`${base}/`, { headers: { "User-Agent": UA } })).text();
const eps = [
  ...main.matchAll(/["'](\/(?:events|api|ajax)[^"']{3,100})["']/gi),
].map((m) => m[1]);

import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("scripts/_probe-form-out", { recursive: true });
writeFileSync(
  "scripts/_probe-form-out/lindo-probe.json",
  JSON.stringify({ out, endpoints: [...new Set(eps)].slice(0, 40), mainLen: main.length }, null, 2),
  "utf8",
);
writeFileSync("scripts/_probe-form-out/lindo-page.html", main.slice(0, 150000), "utf8");
console.log("saved", out.filter((x) => x.interesting || x.status === 200).length, "eps", [...new Set(eps)].slice(0, 15));
for (const row of out) {
  console.log(row.method, row.status, row.len || 0, row.url?.slice(-40), row.interesting ? "YES" : "", row.err || "");
}
