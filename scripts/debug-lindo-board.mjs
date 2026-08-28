import { loadBoard } from "../lib/analyze.mjs";

const data = await loadBoard(true);
const all = data.matches || [];
const singles = data.singlesBySport?.football || [];
const hit = all.find(
  (m) =>
    /мальм/i.test(m.home || "") ||
    /мальм/i.test(m.away || "") ||
    /линдо/i.test(m.home || ""),
);
console.log(
  "board hit",
  hit && {
    home: hit.home,
    away: hit.away,
    odds: hit.odds,
    href: hit.href,
    hasProfile: Boolean(hit.homeProfile),
    pick: hit.profilePick?.label,
    pickOdds: hit.profilePick?.odds,
    ai: hit.aiPick?.label,
    aiOdds: hit.aiPick?.odds,
  },
);
const s = singles.find(
  (m) => /мальм/i.test(m.away || "") || /линдо/i.test(m.home || ""),
);
console.log(
  "singles hit",
  s && {
    home: s.home,
    away: s.away,
    label: s.aiPick?.label,
    odds: s.aiPick?.odds,
    profile: Boolean(s.homeProfile),
  },
);
console.log(
  "singles with profile",
  singles.filter((x) => x.homeProfile).length,
  "/",
  singles.length,
);
