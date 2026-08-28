import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const list = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30_000 });
const hrefs = [
  ...new Set(
    [...(list.text || "").matchAll(/href="(\/matches\/soccer\/[^"]+)"/g)].map((m) => m[1]),
  ),
].slice(0, 6);

console.log("soccer match pages", hrefs);

for (const h of hrefs) {
  const url = "https://stavka.tv" + h;
  const r = await fetchText(url, { timeoutMs: 25_000 });
  const t = r.text || "";
  writeFileSync("scripts/_stavka-match.html", t.slice(0, 250_000));
  const titles = [...new Set([...t.matchAll(/title="([^"]+)"/g)].map((m) => m[1]))];
  const oddsPairs = [
    ...t.matchAll(/title="([^"]+)"[\s\S]*?<span class="odd"[^>]*>([0-9.]+)</g),
  ]
    .map((m) => ({ title: m[1], odd: m[2] }))
    .slice(0, 40);
  const extra = titles.filter((x) =>
    /тотал|фора|обе забь|забьют|больше|меньше|углов|handicap|total/i.test(x),
  );
  // also search plain text for total markers
  const textHits = (t.match(/Тотал|Фора|Обе забьют|Greater than|Asian/gi) || []).slice(0, 20);
  console.log(
    JSON.stringify(
      {
        url,
        status: r.status,
        len: t.length,
        titleCount: titles.length,
        extra,
        oddsPairs: oddsPairs.slice(0, 25),
        textHits,
      },
      null,
      2,
    ),
  );
  if (extra.length || oddsPairs.length > 3) break;
}
