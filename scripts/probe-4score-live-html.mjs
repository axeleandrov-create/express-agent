import { writeFileSync } from "node:fs";
import { fetchText } from "../lib/fetch.mjs";

const r = await fetchText("https://4score.ru/events/", { timeoutMs: 30000 });
const t = r.text || "";
writeFileSync("scripts/_4score-events-live.html", t.slice(0, 500000));

const liveBlocks = t.split('class="lg__block"').filter((b) =>
  /lg__status-live|LIVE|live/i.test(b),
);
console.log("status", r.status, "len", t.length, "liveBlocks", liveBlocks.length);
if (liveBlocks[0]) {
  console.log("--- sample live ---");
  console.log(liveBlocks[0].slice(0, 1200));
}

const preBlocks = t.split('class="lg__block"').filter((b) =>
  /Не началось|Ожидает/i.test(b),
);
console.log("preBlocks", preBlocks.length);
if (preBlocks[0]) console.log(preBlocks[0].slice(0, 800));
