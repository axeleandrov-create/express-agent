import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

const urls = [
  "https://4score.ru/tsska/",
  "https://4score.ru/ofi/",
  "https://4score.ru/teams/tsska/",
  "https://4score.ru/club/tsska/",
  "https://4score.ru/events/19788648/filters/",
];

for (const url of urls) {
  try {
    const isPost = url.includes("/filters/");
    const r = await fetch(url, {
      method: isPost ? "POST" : "GET",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ru",
        Referer: "https://4score.ru/events/tsska-ofi-27-08-2026/",
        ...(isPost
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
              Accept: "application/json, text/javascript, */*; q=0.01",
            }
          : {}),
      },
      body: isPost ? "" : undefined,
      signal: AbortSignal.timeout(25000),
    });
    const t = await r.text();
    const plain = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200);
    console.log(
      r.status,
      t.length,
      /event-block|\d:\d|последн|форм|матч/i.test(t) ? "HIT" : "-",
      url,
    );
    console.log(" ", plain.slice(0, 160));
    if (t.length > 1000 && t.length < 800000) {
      writeFileSync(
        `scripts/_probe-form-out/u-${url.replace(/[^\w]+/g, "_").slice(-50)}.txt`,
        t.slice(0, 150000),
        "utf8",
      );
    }
  } catch (e) {
    console.log("ERR", url, e.message);
  }
}
