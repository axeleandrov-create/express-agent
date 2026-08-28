import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("scripts/_probe-form-out/lindo-page.html", "utf8");
const low = html.toLowerCase();

const jsonScripts = [
  ...html.matchAll(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ),
];
console.log("json scripts", jsonScripts.length);

const classes = [
  ...html.matchAll(
    /class="([^"]*(?:stat|form|match|h2h|result|history|team)[^"]*)"/gi,
  ),
].map((m) => m[1]);
console.log("classes", [...new Set(classes)].slice(0, 50));

const eid =
  html.match(/data-event-id=["']?(\d+)/)?.[1] ||
  html.match(/event[_-]?id["':=\s]+(\d{5,})/i)?.[1] ||
  html.match(/\/events\/(\d{6,})/)?.[1];
console.log("eid", eid);

const i = low.indexOf("20 матч");
const snip = html.slice(Math.max(0, i - 400), i + 1200).replace(/\s+/g, " ");
writeFileSync("scripts/_probe-form-out/lindo-snip.txt", snip, "utf8");
console.log("snip written", snip.length);

// Try AJAX with event id from earlier probe
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";
const eventId = "19709621";
const tries = [
  `https://4score.ru/events/${eventId}/filters/`,
  `https://4score.ru/events/${eventId}/odds/`,
  `https://4score.ru/events/summary/`,
  `https://4score.ru/events/backgroundProcess/`,
];

for (const url of tries) {
  for (const method of ["GET", "POST"]) {
    try {
      const r = await fetch(url, {
        method,
        headers: {
          "User-Agent": UA,
          Referer: "https://4score.ru/events/lindo-ff-malmyo-27-08-2026/",
          "X-Requested-With": "XMLHttpRequest",
          ...(method === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        body: method === "POST" ? `event_id=${eventId}` : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const t = await r.text();
      console.log(method, r.status, t.length, url.slice(-40), t.slice(0, 120).replace(/\s+/g, " "));
    } catch (e) {
      console.log(method, url, e.message);
    }
  }
}

// H2H POST body variants
for (const body of ["", "type=all", "scope=year", "tab=h2h"]) {
  const r = await fetch(
    "https://4score.ru/events/lindo-ff-malmyo-27-08-2026/h2h-stats/",
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Referer: "https://4score.ru/events/lindo-ff-malmyo-27-08-2026/",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
      signal: AbortSignal.timeout(20000),
    },
  );
  const t = await r.text();
  console.log("h2h", body || "(empty)", r.status, t.length, t.slice(0, 200).replace(/\s+/g, " "));
  writeFileSync(`scripts/_probe-form-out/h2h-${body || "empty"}.html`, t, "utf8");
}
