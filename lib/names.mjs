/**
 * Нормализация и нечёткое сравнение имён (аналог validate_data.py).
 */

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const DROP = new Set([
  "fc", "fk", "cf", "ac", "sc", "afc", "bk", "club", "фк",
]);

/** Жёсткий словарь RU/варианты → имя в football-data CSV */
export const TEAM_ALIASES = {
  кардифф: "Cardiff",
  норвич: "Norwich",
  "норвич сити": "Norwich",
  донкастер: "Doncaster",
  "донкастер роверс": "Doncaster",
  мидлсбро: "Middlesbrough",
  "шеффилд уэнсдей": "Sheffield Weds",
  "шеффилд юнайтед": "Sheffield United",
  вулверхэмптон: "Wolves",
  "вулвергемптон": "Wolves",
  флитвуд: "Fleetwood Town",
  "флитвуд таун": "Fleetwood Town",
  шрусбери: "Shrewsbury",
  "шрусбери таун": "Shrewsbury",
  блэкпул: "Blackpool",
  "линкольн сити": "Lincoln",
  линкольн: "Lincoln",
  блэкберн: "Blackburn",
  "блэкберн роверс": "Blackburn",
  ипсвич: "Ipswich",
  "ипсвич таун": "Ipswich",
  лестер: "Leicester",
  "кембридж юнайтед": "Cambridge",
  кембридж: "Cambridge",
  миллуолл: "Millwall",
  уотфорд: "Watford",
  питерборо: "Peterboro",
  "питерборо юнайтед": "Peterboro",
  плимут: "Plymouth",
  ковентри: "Coventry",
  "ковентри сити": "Coventry",
  стивенедж: "Stevenage",
  рединг: "Reading",
  барнсли: "Barnsley",
  "крю александра": "Crewe",
  крю: "Crewe",
  "сток сити": "Stoke",
  сток: "Stoke",
  "халл сити": "Hull",
  халл: "Hull",
  уолсолл: "Walsall",
  "лейтон ориент": "Leyton Orient",
  саутгемптон: "Southampton",
  "вест хэм": "West Ham",
  вестхэм: "West Ham",
  "бирмингем сити": "Birmingham",
  бирмингем: "Birmingham",
  брендфорд: "Brentford",
  брептфорд: "Brentford",
  "ноттингем форест": "Nott'm Forest",
  ноттингем: "Nott'm Forest",
  лидс: "Leeds",
  валенсия: "Valencia",
  бетис: "Betis",
  селтик: "Celtic",
  реал: "Real Madrid",
  "реал мадрид": "Real Madrid",
  "реал сосьедад": "Sociedad",
  "реал сосиедад": "Sociedad",
  барселона: "Barcelona",
  арсенал: "Arsenal",
  челси: "Chelsea",
  ливерпуль: "Liverpool",
  "ман сити": "Man City",
  "манчестер сити": "Man City",
  мю: "Man United",
  "манчестер юнайтед": "Man United",
  бристоль: "Bristol City",
  "нек неймеген": "Nijmegen",
  нек: "Nijmegen",
  тоттенхэм: "Tottenham",
  тоттенхем: "Tottenham",
  ньюкасл: "Newcastle",
  "ньюкасл юнайтед": "Newcastle",
  "астон вилла": "Aston Villa",
  брайтон: "Brighton",
  эвертон: "Everton",
  фулем: "Fulham",
  фулхэм: "Fulham",
  "кристал пэлас": "Crystal Palace",
  борнмут: "Bournemouth",
  "вест бром": "West Brom",
  "вест бромвич": "West Brom",
  "вест бромвич альбион": "West Brom",
  чарльтон: "Charlton",
  "чарльтон атлетик": "Charlton",
  престон: "Preston",
  "престон норт энд": "Preston",
  бернли: "Burnley",
  бёрнли: "Burnley",
  брэдфорд: "Bradford",
  "брэдфорд сити": "Bradford",
  атлетико: "Ath Madrid",
  "атлетико мадрид": "Ath Madrid",
  севилья: "Sevilla",
  вильярреал: "Villarreal",
  сосьедад: "Sociedad",
  "атлетик бильбао": "Ath Bilbao",
  бавария: "Bayern Munich",
  дортмунд: "Dortmund",
  "боруссия дортмунд": "Dortmund",
  лейпциг: "RB Leipzig",
  леверкузен: "Leverkusen",
  франкфурт: "Ein Frankfurt",
  интер: "Inter",
  милан: "Milan",
  ювентус: "Juventus",
  наполи: "Napoli",
  рома: "Roma",
  лацио: "Lazio",
  аталанта: "Atalanta",
  псж: "Paris SG",
  аякс: "Ajax",
  бенфика: "Benfica",
  порту: "Porto",
  флитвуд: "Fleetwood Town",
  "флитвуд таун": "Fleetwood Town",
  шрусбери: "Shrewsbury",
  "шрусбери таун": "Shrewsbury",
  линкольн: "Lincoln",
  "линкольн сити": "Lincoln",
  питерборо: "Peterboro",
  "питерборо юнайтед": "Peterboro",
  крю: "Crewe",
  "крю александра": "Crewe",
  уолсолл: "Walsall",
  "лейтон ориент": "Leyton Orient",
};

export function normalizeTeamName(name) {
  let s = String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  s = s.replace(/[()[\].,\-–—_/]+/g, " ");
  const words = s
    .split(/\s+/)
    .filter((w) => w && !DROP.has(w));
  const joined = words.join(" ");
  const translit = joined
    .split("")
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "");
  return translit;
}

export function normName(s) {
  return normalizeTeamName(s);
}

function sequenceRatio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lcs = dp[0][0];
  return (2 * lcs) / (m + n);
}

export function similarity(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb || na.includes(nb) || nb.includes(na)) return 1;
  return sequenceRatio(na, nb);
}

export function teamsSimilar(a, b) {
  return similarity(a, b) >= 0.8;
}

function aliasFor(name) {
  const raw = String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  if (!raw) return null;
  if (TEAM_ALIASES[raw]) return TEAM_ALIASES[raw];
  // «Реал Сосьедад» → ключ «сосьедад»; «Вест Бромвич Альбион» → по частям
  const withoutPrefix = raw.replace(
    /^(реал|атлетик|атлетико|боруссия)\s+/,
    "",
  );
  if (withoutPrefix !== raw && TEAM_ALIASES[withoutPrefix]) {
    return TEAM_ALIASES[withoutPrefix];
  }
  const words = raw.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const slice = words.slice(i).join(" ");
    if (TEAM_ALIASES[slice]) return TEAM_ALIASES[slice];
  }
  if (words.length >= 2 && TEAM_ALIASES[words[0]]) return TEAM_ALIASES[words[0]];
  return TEAM_ALIASES[normalizeTeamName(name)] || null;
}

export function bestFuzzyMatch(name, candidates, threshold = 0.8) {
  const alias = aliasFor(name);
  if (alias && candidates.has?.(alias)) return { name: alias, score: 1 };
  if (alias) {
    for (const c of candidates) {
      if (c === alias || similarity(c, alias) >= 0.9) return { name: c, score: 1 };
    }
  }

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const sc = similarity(name, c);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  if (best && bestScore >= threshold) return { name: best, score: bestScore };
  // чуть мягче для известных ближних пар (Мидлсбро 76% и т.п.)
  if (best && bestScore >= 0.74) return { name: best, score: bestScore };
  return { name: null, score: bestScore };
}

export function findByTeams(list, home, away) {
  let fallback = null;
  for (const row of list) {
    if (normalizeTeamName(row.home) === normalizeTeamName(home) &&
        normalizeTeamName(row.away) === normalizeTeamName(away)) {
      return row;
    }
    if (teamsSimilar(row.home, home) && teamsSimilar(row.away, away)) {
      if (!fallback) fallback = row;
    }
  }
  return fallback;
}
