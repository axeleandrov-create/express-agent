const res = await fetch("https://understat.com/js/league.min.js?t=1765269520");
const t = await res.text();
console.log("len", t.length);

const needles = [
  "getLeagueData",
  "teamsData",
  "/get",
  "ajax",
  "league/",
  "JSON.parse",
  "understat.com/api",
  "main.php",
];
for (const n of needles) {
  const i = t.indexOf(n);
  if (i >= 0) console.log(n, i, JSON.stringify(t.slice(i, i + 160)));
}

// pull string literals that look like endpoints
const strs = [...t.matchAll(/"([^"]{4,80})"/g)].map((m) => m[1]);
console.log(
  "endpoint-like",
  [...new Set(strs.filter((s) => /league|api|data|get|json|php/i.test(s)))].slice(0, 50),
);
