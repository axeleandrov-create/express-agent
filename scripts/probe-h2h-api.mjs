const eventId = "19726250";
const url = `https://4score.ru/events/${eventId}/filters/`;

const attempts = [
  { name: "empty", body: "" },
  {
    name: "h2h",
    body: new URLSearchParams({
      "filters[block]": "h2h",
      block: "h2h",
      id: eventId,
    }).toString(),
  },
  {
    name: "json",
    body: JSON.stringify({ block: "h2h" }),
    type: "application/json",
  },
];

for (const a of attempts) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://4score.ru/events/avangard-kursk-kaluga-25-08-2026/",
      "Content-Type": a.type || "application/x-www-form-urlencoded",
      Accept: "*/*",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: a.body || undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  console.log("\n===", a.name, res.status, "len", text.length);
  console.log(text.slice(0, 500));
  if (text.includes("h2h") || text.includes("встреч") || text.includes("score")) {
    console.log("...hits...");
  }
}
