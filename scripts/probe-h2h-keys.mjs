import { writeFileSync } from "node:fs";

const eventId = "19726250";
const res = await fetch(`https://4score.ru/events/${eventId}/filters/`, {
  method: "POST",
  headers: {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://4score.ru/events/avangard-kursk-kaluga-25-08-2026/",
    Accept: "application/json,*/*",
    "X-Requested-With": "XMLHttpRequest",
  },
  signal: AbortSignal.timeout(30000),
});
const j = await res.json();
const html = j?.data?.html || {};
console.log("keys", Object.keys(html));
for (const [k, v] of Object.entries(html)) {
  console.log(k, "len", String(v).length);
  writeFileSync(`scripts/_filter-${k}.html`, String(v), "utf8");
}
