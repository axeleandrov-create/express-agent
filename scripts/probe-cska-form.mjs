import { writeFileSync, mkdirSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";
const slug = "tsska-ofi-27-08-2026";
const base = `https://4score.ru/events/${slug}`;

async function tryReq(url, method = "GET", body) {
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
      body: method === "POST" ? body || "" : undefined,
    });
    const t = await r.text();
    return {
      url,
      method,
      status: r.status,
      len: t.length,
      hasScore: /\d+\s*:\s*\d+/.test(t),
      hasEvent: /event-block|event-date|data-localteam-score/.test(t),
      sample: t.slice(0, 400).replace(/\s+/g, " "),
      text: t,
    };
  } catch (e) {
    return { url, method, err: e.message };
  }
}

mkdirSync("scripts/_probe-form-out", { recursive: true });

const paths = [
  "/last-matches/",
  "/form/",
  "/stats/",
  "/results/",
  "/team-form/",
];

for (const p of paths) {
  for (const method of ["GET", "POST"]) {
    const row = await tryReq(`${base}${p}`, method);
    console.log(
      method,
      row.status,
      row.len || 0,
      "score=" + !!row.hasScore,
      "event=" + !!row.hasEvent,
      p,
      row.err || "",
    );
    if (row.text && row.len > 500) {
      writeFileSync(
        `scripts/_probe-form-out/cska${p.replaceAll("/", "-")}${method}.html`,
        row.text,
        "utf8",
      );
    }
  }
}
