import { readFileSync } from "node:fs";

const t = readFileSync("scripts/_probe-4score-home.html", "utf8");
const blocks = t.split('class="hml"').slice(1);
console.log("blocks", blocks.length);
for (const b of blocks.slice(0, 8)) {
  const teams = b.match(/hml-h2"><a[^>]*>([^<]+)/)?.[1];
  const market = b.match(/hml__total">\s*<span>([^<]+)/)?.[1];
  const odds = b.match(/class="hml__k">([0-9.]+)/)?.[1];
  const prob = b.match(/class="hml__percent">\s*<span>(\d+)%/s)?.[1];
  console.log({ teams, market, odds, prob });
}

const outcomes = blocks.filter((b) =>
  /победа|п1|п2|ничья|1x2|исход/i.test(b.match(/hml__total">\s*<span>([^<]+)/)?.[1] || ""),
);
console.log("outcome-like", outcomes.length);
for (const b of outcomes.slice(0, 10)) {
  console.log({
    teams: b.match(/hml-h2"><a[^>]*>([^<]+)/)?.[1],
    market: b.match(/hml__total">\s*<span>([^<]+)/)?.[1],
    odds: b.match(/class="hml__k">([0-9.]+)/)?.[1],
    prob: b.match(/class="hml__percent">\s*<span>(\d+)%/s)?.[1],
  });
}
