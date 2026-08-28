"""
Валидация сквозных данных: Stavka.TV ↔ football-data.
Запуск из папки express-agent:
  python scripts/validate_data.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

try:
    import requests
except ImportError:
    print("Нужен requests: pip install requests")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
CACHE.mkdir(exist_ok=True)

STAVKA_URL = "https://stavka.tv/matches/soccer"
FD_BASE = "https://www.football-data.co.uk/mmz4281"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

MONTHS_RU = {
    "янв": 0,
    "фев": 1,
    "мар": 2,
    "апр": 3,
    "май": 4,
    "июн": 5,
    "июл": 6,
    "авг": 7,
    "сен": 8,
    "окт": 9,
    "ноя": 10,
    "дек": 11,
}


def normalize_team_name(name: str) -> str:
    s = (name or "").lower().strip()
    s = s.replace("ё", "е")
    for junk in (
        "фк ",
        "fc ",
        "fk ",
        "cf ",
        "ac ",
        "sc ",
        "afc ",
        "club ",
        "юнайтед",
        "united",
        "city",
    ):
        s = s.replace(junk, " ")
    s = re.sub(r"[\(\)\[\]\.\,\-–—_/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # translit for fuzzy EN↔RU
    table = str.maketrans(
        {
            "а": "a",
            "б": "b",
            "в": "v",
            "г": "g",
            "д": "d",
            "е": "e",
            "ж": "zh",
            "з": "z",
            "и": "i",
            "й": "y",
            "к": "k",
            "л": "l",
            "м": "m",
            "н": "n",
            "о": "o",
            "п": "p",
            "р": "r",
            "с": "s",
            "т": "t",
            "у": "u",
            "ф": "f",
            "х": "h",
            "ц": "ts",
            "ч": "ch",
            "ш": "sh",
            "щ": "sch",
            "ъ": "",
            "ы": "y",
            "ь": "",
            "э": "e",
            "ю": "yu",
            "я": "ya",
        }
    )
    return s.translate(table).replace(" ", "")


def similarity(a: str, b: str) -> float:
    na, nb = normalize_team_name(a), normalize_team_name(b)
    if not na or not nb:
        return 0.0
    if na == nb or na in nb or nb in na:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def best_match(name: str, candidates: list[str], threshold: float = 0.8):
    best = None
    best_score = 0.0
    for c in candidates:
        sc = similarity(name, c)
        if sc > best_score:
            best_score = sc
            best = c
    if best_score >= threshold:
        return best, best_score
    return None, best_score


def parse_stavka_html(html: str) -> list[dict]:
    """Минимальный разбор списка матчей + все title→кф в строке."""
    rows = []
    chunks = html.split("MatchesRow match-row")[1:]
    for chunk in chunks[:80]:
        teams = re.findall(r'class="team-name[^"]*"[^>]*>([^<]+)', chunk)
        if len(teams) < 2:
            continue
        markets = []
        for title, odd in re.findall(
            r'title="([^"]+)"[\s\S]*?<span class="odd"[^>]*>([0-9.]+)<', chunk
        ):
            try:
                v = float(odd)
            except ValueError:
                continue
            if v >= 1.01:
                markets.append({"market": title, "odds": v})
        if not markets:
            continue
        rows.append(
            {
                "home": teams[0].strip(),
                "away": teams[1].strip(),
                "markets": markets,
                "has_1x2": any(
                    m["market"] in ("Победа 1", "Ничья", "Победа 2") for m in markets
                ),
                "has_extra": any(
                    re.search(
                        r"тотал|фора\b|обе забь|забьют|больше|меньше|углов",
                        m["market"],
                        re.I,
                    )
                    for m in markets
                ),
            }
        )
    return rows


def load_fd_teams(season: str = "2526", league: str = "E0") -> tuple[list[str], list[dict]]:
    path = CACHE / f"{season}_{league}.csv"
    if not path.exists():
        url = f"{FD_BASE}/{season}/{league}.csv"
        print(f"Скачиваю {url} …")
        r = requests.get(url, headers=UA, timeout=40)
        if r.status_code != 200 or len(r.content) < 200:
            print(f"  FAIL HTTP {r.status_code}")
            return [], []
        path.write_bytes(r.content)
    rows = []
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("HomeTeam") and row.get("AwayTeam"):
                rows.append(
                    {
                        "home": row["HomeTeam"],
                        "away": row["AwayTeam"],
                        "FTHG": row.get("FTHG"),
                        "FTAG": row.get("FTAG"),
                        "date": row.get("Date"),
                        # football-data CSV: голы, не xG. Честно пишем это.
                        "note": "football-data: FTHG/FTAG (голы), не xG",
                    }
                )
    teams = sorted({r["home"] for r in rows} | {r["away"] for r in rows})
    return teams, rows


def main() -> None:
    print("=" * 60)
    print("1) Stavka.TV — сырой разбор")
    print("=" * 60)
    r = requests.get(STAVKA_URL, headers=UA, timeout=40)
    print(f"HTTP {r.status_code}, bytes={len(r.content)}")
    (CACHE / "validate_stavka.html").write_bytes(r.content)
    stavka = parse_stavka_html(r.text)
    print(f"Матчей с кэфами (первые чанки): {len(stavka)}")
    if stavka:
        sample = stavka[0]
        print("\nПример структуры матча Stavka:")
        print(json.dumps(sample, ensure_ascii=False, indent=2)[:2000])
        only_1x2 = sum(1 for m in stavka if m["has_1x2"] and not m["has_extra"])
        with_extra = sum(1 for m in stavka if m["has_extra"])
        print(f"\nТолько П1/Х/П2: {only_1x2}")
        print(f"Есть доп. маркеты в HTML-строке: {with_extra}")
        if with_extra == 0:
            print(
                "Внимание: дополнительные маркеты для экспресса отсутствуют "
                "(в списке матчей Stavka на /matches/soccer видны в основном 1X2)."
            )
        else:
            extra_names = sorted(
                {
                    x["market"]
                    for m in stavka
                    for x in m["markets"]
                    if re.search(
                        r"тотал|фора\b|обе забь|забьют|больше|меньше|углов",
                        x["market"],
                        re.I,
                    )
                }
            )
            print("Найденные доп. названия:", extra_names[:30])

    print("\n" + "=" * 60)
    print("2) Football-Data — CSV (история голов, НЕ xG)")
    print("=" * 60)
    teams, fd_rows = load_fd_teams("2526", "E0")
    print(f"Команд E0: {len(teams)}, матчей в CSV: {len(fd_rows)}")
    if fd_rows:
        print("Пример строки football-data:")
        print(json.dumps(fd_rows[-1], ensure_ascii=False, indent=2))
        print("Ключи CSV (образец): HomeTeam, AwayTeam, FTHG, FTAG, Date — xG в этом источнике нет.")

    # Подмешать E1
    t1, _ = load_fd_teams("2526", "E1")
    teams = sorted(set(teams) | set(t1))
    print(f"Команд E0+E1 для матчинга: {len(teams)}")

    print("\n" + "=" * 60)
    print("3) Fuzzy mapping Stavka -> football-data (>=80%)")
    print("=" * 60)
    mapped = 0
    weak = 0
    mapping = {}
    for m in stavka[:40]:
        for side in ("home", "away"):
            raw = m[side]
            hit, score = best_match(raw, teams, 0.8)
            if hit:
                mapped += 1
                mapping[raw] = {"fd": hit, "score": round(score, 3)}
                print(f"  OK  {raw!r} -> {hit!r} ({score:.0%})")
            else:
                weak += 1
                print(f"  --  {raw!r} best={score:.0%} (порог 80% не пройден)")

    out = CACHE / "validate_name_map.json"
    out.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nСохранено: {out}")
    print(f"Связано пар имён: {mapped}, без пары: {weak}")

    print("\n" + "=" * 60)
    print("ИТОГ")
    print("=" * 60)
    print("- Stavka /matches/soccer: проверь блок 'доп. маркеты' выше.")
    print("- football-data даёт голы (FTHG/FTAG), не xG.")
    print("- Маппинг: normalize_team_name + SequenceMatcher ≥ 80%.")
    print("- Дальше: расширить парсер Stavka (страница матча / API), если доп. маркетов нет в списке.")


if __name__ == "__main__":
    main()
