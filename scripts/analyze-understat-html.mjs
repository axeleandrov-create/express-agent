import { readFileSync } from "fs";
const t = readFileSync("scripts/_probe-understat-out/EPL-html.txt", "utf8");
for (const n of ["teamsData", "datesData", "playersData", "JSON.parse", "getLeague", "xG", "script"]) {
  const i = t.indexOf(n);
  console.log(n, i);
  if (i >= 0) console.log(JSON.stringify(t.slice(Math.max(0, i - 40), i + 160)));
}
const srcs = [...t.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
console.log("js", srcs.slice(0, 20));
