/**
 * Шаг 1: probe Zulubet — что отдаёт сайт.
 * node scripts/probe-zulubet.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "scripts/_probe-zulubet-out");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const URLS = [
  "https://www.zulubet.com/",
  "https://www.zulubet.com/tips/today.html",
  "https://zulubet.com/",
  "https://www.zulubet.com/football/",
  "https://www.zulubet.com/predictions/",
];

function slug(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .slice(0, 70);
}

for (const url of URLS) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(25000),
      redirect: "follow",
    });
    const t = await res.text();
    writeFileSync(resolve(OUT, `${slug(url)}.html`), t.slice(0, 250000), "utf8");

    const title = (t.match(/<title[^>]*>([^<]+)/i) || [])[1] || "";
    const apis = [
      ...t.matchAll(/https?:\/\/[^"'\\\s]+(?:api|ajax|json|feed)[^"'\\\s]*/gi),
    ]
      .map((m) => m[0])
      .slice(0, 12);
    const hrefs = [...t.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((h) => /tip|today|predict|odds|match|football/i.test(h))
      .slice(0, 25);
    const odds = t.match(/\b1\.\d{2}\b/g) || [];
    const rows = (t.match(/<tr[\s>]/gi) || []).length;

    console.log(
      JSON.stringify(
        {
          url,
          status: res.status,
          final: res.url,
          len: t.length,
          title: title.trim(),
          tableRows: rows,
          sampleOdds: odds.slice(0, 10),
          hrefs,
          apis,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.log(JSON.stringify({ url, error: e.message }));
  }
}
