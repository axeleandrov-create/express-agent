/**
 * Профиль команды + «таблица ставок» (N из M) по последним матчам.
 * C1: по умолчанию последние 10 матчей (any).
 */

function round2(x) {
  return Math.round(x * 100) / 100;
}

function frac(hit, n) {
  if (!n) return { hit: 0, n: 0, pct: 0, label: "—" };
  return {
    hit,
    n,
    pct: Math.round((hit / n) * 100),
    label: `${hit}/${n}`,
  };
}

/**
 * @param {"any"|"home"|"away"} venue
 */
export function buildTeamProfile(rows, teamCsv, {
  n = 10,
  venue = "any",
  displayName = null,
} = {}) {
  if (!teamCsv || !rows?.length) return null;

  let games = rows.filter((r) => r.HomeTeam === teamCsv || r.AwayTeam === teamCsv);
  if (venue === "home") games = games.filter((r) => r.HomeTeam === teamCsv);
  if (venue === "away") games = games.filter((r) => r.AwayTeam === teamCsv);
  games = games.slice(-n);
  if (games.length < 5) return null;

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gfSum = 0;
  let gaSum = 0;
  let totSum = 0;
  let itb05 = 0;
  let itb15 = 0;
  let btts = 0;
  let over15 = 0;
  let over25 = 0;
  let maxGf = 0;
  let minGf = 99;
  let maxGa = 0;
  let minGa = 99;
  const slimGames = [];

  for (const g of games) {
    const hg = Number(g.FTHG);
    const ag = Number(g.FTAG);
    if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
    const isHome = g.HomeTeam === teamCsv;
    const gf = isHome ? hg : ag;
    const ga = isHome ? ag : hg;
    const tot = hg + ag;

    gfSum += gf;
    gaSum += ga;
    totSum += tot;
    if (gf > maxGf) maxGf = gf;
    if (gf < minGf) minGf = gf;
    if (ga > maxGa) maxGa = ga;
    if (ga < minGa) minGa = ga;

    if (gf > 0) itb05++;
    if (gf >= 2) itb15++;
    if (hg > 0 && ag > 0) btts++;
    if (tot >= 2) over15++;
    if (tot >= 3) over25++;

    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;

    slimGames.push({
      date: g.Date || "",
      opp: isHome ? g.AwayTeam : g.HomeTeam,
      gf,
      ga,
      tot,
      home: isHome,
    });
  }

  const m = slimGames.length;
  if (m < 5) return null;
  if (minGf === 99) minGf = 0;
  if (minGa === 99) minGa = 0;

  const betTable = {
    itb05: frac(itb05, m),
    itb15: frac(itb15, m),
    btts: frac(btts, m),
    over15: frac(over15, m),
    over25: frac(over25, m),
    win: frac(wins, m),
    draw: frac(draws, m),
    loss: frac(losses, m),
  };

  const recent = slimGames.slice(-8);
  return {
    name: displayName || teamCsv,
    csvName: teamCsv,
    n: m,
    venue,
    summary: {
      wins,
      draws,
      losses,
      avgIT: round2(gfSum / m),
      avgITOpp: round2(gaSum / m),
      avgT: round2(totSum / m),
      maxIT: maxGf,
      minIT: minGf,
      maxITOpp: maxGa,
      minITOpp: minGa,
    },
    betTable,
    games: recent,
    /** Последние результаты: W / D / L */
    form: formFromGames(recent, 5),
  };
}

/** Серия формы: W победа, D ничья, L поражение (от старых к новым). */
export function formFromGames(games, max = 5) {
  if (!games?.length) return [];
  return games.slice(-max).map((g) => {
    if (g.gf > g.ga) return "W";
    if (g.gf < g.ga) return "L";
    return "D";
  });
}

/** @deprecated используй formFromGames */
export function formMarksFromGames(games, max = 5) {
  return formFromGames(games, max).join("");
}

/** Короткие строки для UI / why */
export function profileStatLines(profile) {
  if (!profile?.betTable) return [];
  const { name, betTable: t, summary: s, n, venue } = profile;
  const venueRu =
    venue === "home" ? " (дома)" : venue === "away" ? " (в гостях)" : "";
  return [
    `${name}${venueRu}: ИТБ 1.5 = ${t.itb15?.label || t.itb05?.label || "—"}, ОЗ = ${t.btts.label}, ТБ 2.5 = ${t.over25.label}`,
    `Ср ИТ ${s.avgIT} · Ср ИТ соп. ${s.avgITOpp} · Ср Т ${s.avgT} · форма ${s.wins}-${s.draws}-${s.losses} за ${n}`,
  ];
}
