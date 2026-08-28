import { writeFileSync } from "node:fs";

const slug = "avangard-kursk-kaluga-25-08-2026";
const bodies = [
  new URLSearchParams({
    "filters[indicators]": "goals",
    "filters[periods]": "full",
  }).toString(),
  new URLSearchParams({
    "filters[indicators]": "goals",
    "filters[periods]": "full",
    "filters[seasons]": "year",
  }).toString(),
  "filters[indicators]=goals&filters[periods]=full",
];

for (let i = 0; i < bodies.length; i++) {
  const res = await fetch(`https://4score.ru/events/${slug}/h2h-stats/`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: `https://4score.ru/events/${slug}/`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
    },
    body: bodies[i],
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  console.log(i, res.status, "len", text.length, text.slice(0, 200).replace(/\s+/g, " "));
  writeFileSync(`scripts/_h2h-stats-${i}.html`, text, "utf8");
}
