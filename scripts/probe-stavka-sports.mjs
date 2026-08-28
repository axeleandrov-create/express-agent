import { fetchText } from "../lib/fetch.mjs";

const STAVKA_SPORTS = [
  { path: "/matches/soccer", sport: "football", label: "Футбол" },
  { path: "/matches/ice-hockey", sport: "hockey", label: "Хоккей" },
  { path: "/matches/basketball", sport: "basketball", label: "Баскетбол" },
  { path: "/matches/tennis", sport: "tennis", label: "Теннис" },
  { path: "/matches/volleyball", sport: "volleyball", label: "Волейбол" },
  { path: "/matches/handball", sport: "handball", label: "Гандбол" },
];

for (const s of STAVKA_SPORTS) {
  const r = await fetchText("https://stavka.tv" + s.path, { timeoutMs: 20000 });
  const t = r.text || "";
  const rows = t.split("MatchesRow match-row").length - 1;
  const liveish = (t.match(/event-status[^>]*>[^<]*['′`]/g) || []).length;
  console.log(JSON.stringify({ sport: s.sport, status: r.status, rows, liveish, len: t.length }));
}
