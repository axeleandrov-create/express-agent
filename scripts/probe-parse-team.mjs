import { readFileSync, writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

async function load(slug) {
  const url = `https://4score.ru/teams/${slug}/`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ru" },
    signal: AbortSignal.timeout(25000),
  });
  const html = await r.text();
  writeFileSync(`scripts/_probe-form-out/team-${slug}.html`, html, "utf8");
  console.log(slug, r.status, html.length);

  const labels = [
    "Последние",
    "Результаты",
    "event-block",
    "data-localteam-score",
    "form",
    "W",
    "побед",
  ];
  for (const lab of labels) {
    const i = html.indexOf(lab);
    if (i >= 0) {
      const plain = html
        .slice(Math.max(0, i - 80), i + 600)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      console.log(" ", lab, "->", plain.slice(0, 220));
    }
  }

  const blocks = html.split('class="event-block"').length - 1;
  console.log("  event-blocks", blocks);
  const scores = [...html.matchAll(/data-localteam-score="(\d+)"[^>]*data-visitorteam-score="(\d+)"/g)]
    .slice(0, 8)
    .map((m) => `${m[1]}:${m[2]}`);
  console.log("  scores", scores.join(", "));
}

await load("tsska");
await load("ofi");
