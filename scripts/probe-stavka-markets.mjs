import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://stavka.tv/matches/soccer", { timeoutMs: 30_000 });
writeFileSync("scripts/_stavka-soccer.html", r.text || "");
console.log({ ok: r.ok, status: r.status, len: (r.text || "").length });

const t = r.text || "";
const titles = [...t.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(titles)].filter((x) =>
  /побед|нич|тотал|фора|обе|больше|меньше|углов|handicap|total|btts|забьют|форы/i.test(
    x,
  ),
);
console.log("market titles sample:", uniq.slice(0, 50));
console.log("odd spans", (t.match(/class="odd"/g) || []).length);
console.log("match rows", (t.match(/MatchesRow match-row/g) || []).length);

// One row dump: all title+odd pairs
const chunk = t.split("MatchesRow match-row")[2] || "";
const pairs = [...chunk.matchAll(/title="([^"]+)"[\s\S]*?<span class="odd"[^>]*>([0-9.]+)</g)].map(
  (m) => ({ title: m[1], odd: m[2] }),
);
console.log("sample row markets:", pairs);
