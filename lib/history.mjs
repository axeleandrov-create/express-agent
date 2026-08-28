import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./fetch.mjs";
import { bestFuzzyMatch } from "./names.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "cache");
mkdirSync(CACHE, { recursive: true });

const LEAGUES = {
  E0: "Англия · Премьер-лига",
  E1: "Англия · Чемпионшип",
  E2: "Англия · Лига 1",
  E3: "Англия · Лига 2",
  SP1: "Испания · Ла Лига",
  SP2: "Испания · Сегунда",
  D1: "Германия · Бундеслига",
  D2: "Германия · Вторая Бундеслига",
  I1: "Италия · Серия А",
  I2: "Италия · Серия B",
  F1: "Франция · Лига 1",
  F2: "Франция · Лига 2",
  N1: "Нидерланды · Эредивизи",
  P1: "Португалия · Примейра",
  B1: "Бельгия · Про-лига",
  T1: "Турция · Суперлига",
  SC0: "Шотландия · Премьершип",
};

// Словарь имён — в lib/names.mjs (TEAM_ALIASES + fuzzy)

function seasonCodes(n = 2) {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const codes = [];
  for (let i = 0; i < n; i++) {
    const y = startYear - i;
    codes.push(`${String(y % 100).padStart(2, "0")}${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return codes;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < headers.length / 2) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx]?.trim() ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

async function downloadLeagueCsv(league, season) {
  const fname = `${season}_${league}.csv`;
  const path = resolve(CACHE, fname);
  if (existsSync(path)) {
    const ageH = (Date.now() - statSync(path).mtimeMs) / 3600_000;
    if (ageH < 12) return path;
  }
  const url = `https://www.football-data.co.uk/mmz4281/${season}/${league}.csv`;
  const res = await fetchText(url, {
    timeoutMs: 25_000,
    headers: { Accept: "text/csv,*/*", "Accept-Language": "en" },
  });
  if (!res.ok || !res.text || res.text.length < 200) {
    return existsSync(path) ? path : null;
  }
  writeFileSync(path, res.text, "utf8");
  return path;
}

function resolveCsvName(raw, csvTeams) {
  const hit = bestFuzzyMatch(raw, csvTeams, 0.8);
  return hit.name;
}

function teamMatches(rows, team, asHome) {
  return rows.filter((r) =>
    asHome ? r.HomeTeam === team : r.AwayTeam === team,
  );
}

function lastN(arr, n) {
  return arr.slice(-n);
}

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formHint(rows, team, n = 5) {
  const games = rows
    .filter((r) => r.HomeTeam === team || r.AwayTeam === team)
    .slice(-n);
  if (!games.length) return "мало данных по форме";

  let pts = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const seq = []; // от старых к новым: W/D/L
  for (const g of games) {
    const hg = Number(g.FTHG);
    const ag = Number(g.FTAG);
    if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
    let r = "D";
    if (g.HomeTeam === team) {
      if (hg > ag) r = "W";
      else if (hg < ag) r = "L";
    } else {
      if (ag > hg) r = "W";
      else if (ag < hg) r = "L";
    }
    if (r === "W") {
      pts += 3;
      wins++;
    } else if (r === "D") {
      pts += 1;
      draws++;
    } else losses++;
    seq.push(r);
  }
  if (!seq.length) return "мало данных по форме";

  let unbeaten = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] === "L") break;
    unbeaten++;
  }
  let winStreak = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] !== "W") break;
    winStreak++;
  }
  let loseStreak = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] !== "L") break;
    loseStreak++;
  }

  const max = seq.length * 3;
  if (winStreak >= 3) {
    return `выиграла последние ${winStreak} матчей подряд`;
  }
  if (unbeaten >= 3 && unbeaten === seq.length) {
    return `не проигрывает последние ${unbeaten} матчей`;
  }
  if (unbeaten >= 4) {
    return `не проигрывает уже ${unbeaten} матчей`;
  }
  if (loseStreak >= 3) {
    return `проиграла последние ${loseStreak} матчей подряд`;
  }
  if (pts >= max * 0.75) {
    return `в ударе — ${pts} из ${max} очков за ${seq.length} игр`;
  }
  if (pts <= max * 0.3 && losses >= 2) {
    return `проседает: ${wins}П-${draws}Н-${losses}Пр за ${seq.length} игр`;
  }
  return `за ${seq.length} матчей ${wins} побед, ${draws} ничьих, ${losses} поражений`;
}

/**
 * Чёткие факты «N из M» для блока «Почему» (MVP).
 * @param {"any"|"home"|"away"} venue
 */
export function teamFactPack(rows, team, { n = 10, venue = "any" } = {}) {
  if (!team || !rows?.length) return null;
  let games = rows.filter((r) => r.HomeTeam === team || r.AwayTeam === team);
  if (venue === "home") games = games.filter((r) => r.HomeTeam === team);
  if (venue === "away") games = games.filter((r) => r.AwayTeam === team);
  games = games.slice(-n);
  if (games.length < 3) return null;

  let scored = 0;
  let conceded = 0;
  let over25 = 0;
  let btts = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const g of games) {
    const hg = Number(g.FTHG);
    const ag = Number(g.FTAG);
    if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
    const gf = g.HomeTeam === team ? hg : ag;
    const ga = g.HomeTeam === team ? ag : hg;
    if (gf > 0) scored++;
    if (ga > 0) conceded++;
    if (hg + ag > 2.5) over25++;
    if (hg > 0 && ag > 0) btts++;
    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  }

  let scoreStreak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    const hg = Number(g.FTHG);
    const ag = Number(g.FTAG);
    if (Number.isNaN(hg) || Number.isNaN(ag)) break;
    const gf = g.HomeTeam === team ? hg : ag;
    if (gf > 0) scoreStreak++;
    else break;
  }

  const m = games.length;
  const pct = (x) => Math.round((x / m) * 100);
  return {
    n: m,
    venue,
    wins,
    draws,
    losses,
    scored,
    conceded,
    over25,
    btts,
    scoreStreak,
    scoredPct: pct(scored),
    bttsPct: pct(btts),
    over25Pct: pct(over25),
    winPct: pct(wins),
  };
}

export function factLinesForTeam(name, facts) {
  if (!facts || !name) return [];
  const lines = [];
  const venueRu =
    facts.venue === "home" ? "дома" : facts.venue === "away" ? "в гостях" : "";

  if (facts.btts >= 3 && facts.bttsPct >= 55) {
    lines.push(
      venueRu
        ? `${name}: обе забивали в ${facts.btts} из ${facts.n} последних ${venueRu} (${facts.bttsPct}%)`
        : `${name}: обе забивали в ${facts.btts} из ${facts.n} последних матчей (${facts.bttsPct}%)`,
    );
  }
  if (facts.scored >= 3) {
    lines.push(
      `${name} забивал(а) в ${facts.scored} из ${facts.n} последних${venueRu ? ` ${venueRu}` : ""}`,
    );
  }
  if (facts.scoreStreak >= 3) {
    lines.push(`${name} забивает в ${facts.scoreStreak} матчах кряду`);
  }
  if (facts.conceded >= 3 && facts.conceded / facts.n >= 0.6) {
    lines.push(`${name} пропускал(а) в ${facts.conceded} из ${facts.n} последних`);
  }
  if (facts.over25 >= 3 && facts.over25Pct >= 55) {
    lines.push(
      `Тотал больше 2.5 был в ${facts.over25} из ${facts.n} матчей с участием ${name} (${facts.over25Pct}%)`,
    );
  }
  if (facts.n >= 5) {
    lines.push(
      `Форма ${name}: ${facts.wins}П-${facts.draws}Н-${facts.losses}Пр за ${facts.n} (${facts.winPct}% побед)`,
    );
  }
  return lines;
}

/**
 * Загрузить историю и посчитать силу команд по последним 12 матчам дома/в гостях.
 */
export async function loadHistoryIndex() {
  const allRows = [];
  for (const season of seasonCodes(2)) {
    for (const league of Object.keys(LEAGUES)) {
      const path = await downloadLeagueCsv(league, season);
      if (!path) continue;
      const text = readFileSync(path, "utf8");
      const rows = parseCsv(text);
      for (const r of rows) {
        if (!r.HomeTeam || !r.AwayTeam) continue;
        const hg = Number(r.FTHG);
        const ag = Number(r.FTAG);
        if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
        allRows.push({
          ...r,
          FTHG: hg,
          FTAG: ag,
          league,
          leagueName: LEAGUES[league],
        });
      }
    }
  }

  const byLeague = new Map();
  for (const r of allRows) {
    if (!byLeague.has(r.league)) byLeague.set(r.league, []);
    byLeague.get(r.league).push(r);
  }

  const strengthByLeague = new Map();
  const csvTeams = new Set(allRows.map((r) => r.HomeTeam).concat(allRows.map((r) => r.AwayTeam)));

  for (const [league, rows] of byLeague) {
    const avgHome = avg(rows.map((r) => r.FTHG)) || 1.3;
    const avgAway = avg(rows.map((r) => r.FTAG)) || 1.1;
    const teams = new Set(rows.map((r) => r.HomeTeam).concat(rows.map((r) => r.AwayTeam)));
    const strength = new Map();

    for (const team of teams) {
      const homeGames = lastN(teamMatches(rows, team, true), 12);
      const awayGames = lastN(teamMatches(rows, team, false), 12);
      if (homeGames.length < 3 && awayGames.length < 3) continue;

      const gfH = avg(homeGames.map((g) => g.FTHG)) ?? avgHome;
      const gaH = avg(homeGames.map((g) => g.FTAG)) ?? avgAway;
      const gfA = avg(awayGames.map((g) => g.FTAG)) ?? avgAway;
      const gaA = avg(awayGames.map((g) => g.FTHG)) ?? avgHome;

      strength.set(team, {
        attackHome: gfH / avgHome,
        attackAway: gfA / avgAway,
        defenseHome: gaH / avgAway,
        defenseAway: gaA / avgHome,
        matches: homeGames.length + awayGames.length,
      });
    }

    strengthByLeague.set(league, { avgHome, avgAway, strength, rows });
  }

  return { allRows, byLeague, strengthByLeague, csvTeams, matchCount: allRows.length };
}

export function lookupTeamStrength(index, homeRaw, awayRaw, leagueHint = "") {
  const homeCsv = resolveCsvName(homeRaw, index.csvTeams);
  const awayCsv = resolveCsvName(awayRaw, index.csvTeams);
  if (!homeCsv || !awayCsv) {
    return { ok: false, reason: "имена не сопоставлены с football-data" };
  }

  // Ищем лигу, где обе команды есть
  let best = null;
  for (const [league, pack] of index.strengthByLeague) {
    const sh = pack.strength.get(homeCsv);
    const sa = pack.strength.get(awayCsv);
    if (!sh || !sa) continue;
    const hintHit =
      leagueHint &&
      (LEAGUES[league].toLowerCase().includes(String(leagueHint).toLowerCase().slice(0, 5)) ||
        String(leagueHint).toLowerCase().includes(LEAGUES[league].split("·")[0].trim().toLowerCase()));
    const score = (hintHit ? 10 : 0) + sh.matches + sa.matches;
    if (!best || score > best.score) {
      best = {
        score,
        league,
        leagueName: LEAGUES[league],
        homeCsv,
        awayCsv,
        homeStr: sh,
        awayStr: sa,
        avgHome: pack.avgHome,
        avgAway: pack.avgAway,
        rows: pack.rows,
      };
    }
  }

  // Кубки / разные дивизионы: берём силу из «домашних» лиг каждой команды
  if (!best) {
    let homePack = null;
    let awayPack = null;
    let sh = null;
    let sa = null;
    for (const [league, pack] of index.strengthByLeague) {
      const h = pack.strength.get(homeCsv);
      const a = pack.strength.get(awayCsv);
      if (h && (!sh || h.matches > sh.matches)) {
        sh = h;
        homePack = pack;
      }
      if (a && (!sa || a.matches > sa.matches)) {
        sa = a;
        awayPack = pack;
      }
    }
    if (sh && sa && homePack && awayPack) {
      // для фактов N из M склеиваем строки обеих лиг (уникальные матчи)
      const rows = [...homePack.rows, ...awayPack.rows];
      best = {
        score: sh.matches + sa.matches,
        league: "MIX",
        leagueName: "смешанные лиги",
        homeCsv,
        awayCsv,
        homeStr: sh,
        awayStr: sa,
        avgHome: (homePack.avgHome + awayPack.avgHome) / 2,
        avgAway: (homePack.avgAway + awayPack.avgAway) / 2,
        rows,
      };
    }
  }

  if (!best) {
    return { ok: false, reason: "нет силы команд в CSV", homeCsv, awayCsv };
  }

  return {
    ok: true,
    ...best,
    formHome: formHint(best.rows, best.homeCsv),
    formAway: formHint(best.rows, best.awayCsv),
    factsHome: teamFactPack(best.rows, best.homeCsv, { n: 10, venue: "any" }),
    factsAway: teamFactPack(best.rows, best.awayCsv, { n: 10, venue: "any" }),
    factsHomeVenue: teamFactPack(best.rows, best.homeCsv, { n: 10, venue: "home" }),
    factsAwayVenue: teamFactPack(best.rows, best.awayCsv, { n: 10, venue: "away" }),
  };
}

