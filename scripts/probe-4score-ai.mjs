const today = new Date().toISOString().slice(0, 10);

async function tryGet(label, extra = {}) {
  const params = {
    "filters[market_id]": "1",
    "filters[market_type]": "all",
    "filters[argument]": "all",
    "filters[dates]": today,
    "filters[confidence]": "interval",
    "filters[extra][confidence][interval][from]": "10",
    "filters[extra][confidence][interval][to]": "100",
    "filters[probability]": "interval",
    "filters[extra][probability][interval][from]": "40",
    "filters[extra][probability][interval][to]": "100",
    "filters[rate]": "interval",
    "filters[extra][rate][interval][from]": "1.2",
    "filters[extra][rate][interval][to]": "8",
    "filters[bookmaker]": "35",
    "filters[roi]": "all",
    "filters[events_count]": "all",
    ...extra,
  };
  const body = new URLSearchParams(params);
  const res = await fetch("https://4score.ru/ai/get/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      Referer: "https://4score.ru/",
    },
    body: body.toString(),
  });
  const html = await res.text();
  const teams = [...html.matchAll(/hml-h2"><a[^>]*>([^<]+)/g)].map((m) => m[1]);
  const picks = [...html.matchAll(/hml__total">\s*<span>([^<]+)/g)].map((m) =>
    m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  );
  const probs = [...html.matchAll(/hml__percent">\s*<span>(\d+)%/gs)].map((m) => m[1]);
  console.log(label, {
    status: res.status,
    len: html.length,
    teams: teams.slice(0, 4),
    picks: picks.slice(0, 4),
    probs: probs.slice(0, 4),
  });
}

console.log("today", today);
await tryGet("market1 all");
await tryGet("market1 win1", { "filters[market_type]": "win1" });
await tryGet("market1 win2", { "filters[market_type]": "win2" });
await tryGet("market1 draw", { "filters[market_type]": "draw" });
await tryGet("market5 totals", {
  "filters[market_id]": "5",
  "filters[market_type]": "total_more",
  "filters[argument]": "interval",
  "filters[extra][argument][interval][from]": "1.5",
  "filters[extra][argument][interval][to]": "3.5",
});
