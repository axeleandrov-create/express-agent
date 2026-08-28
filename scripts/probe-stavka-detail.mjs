import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const list = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30_000 });
const hrefs = [...(list.text || "").matchAll(/href="(\/matches\/[^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(hrefs)].filter((h) => !h.includes("soccer") || h.split("/").length > 3);
console.log("match hrefs", uniq.slice(0, 15));

const candidates = [
  ...uniq.slice(0, 5).map((h) => "https://stavka.tv" + h),
  "https://stavka.tv/matches/soccer?market=totals",
  "https://stavka.tv/matches/soccer?tab=totals",
];

for (const url of candidates) {
  const r = await fetchText(url, { timeoutMs: 25_000 });
  const t = r.text || "";
  const titles = [...new Set([...t.matchAll(/title="([^"]+)"/g)].map((m) => m[1]))];
  const extra = titles.filter((x) =>
    /тотал|фора|обе|забьют|больше|меньше|углов/i.test(x),
  );
  console.log(
    JSON.stringify({
      url,
      status: r.status,
      len: t.length,
      titles: titles.slice(0, 12),
      extra: extra.slice(0, 15),
    }),
  );
  if (extra.length) {
    writeFileSync("scripts/_stavka-extra.html", t.slice(0, 200_000));
    break;
  }
}
