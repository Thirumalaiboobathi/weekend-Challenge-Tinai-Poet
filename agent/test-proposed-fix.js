// Throwaway — tests a CANDIDATE fix (palai requires cloudCover < 50%,
// in addition to the existing temp/humidity condition) against the
// same real 30-day data, WITHOUT touching weatherThinai.ts. Proposal
// only, not applied.

const MADURAI_LATITUDE = 9.9252;
const MADURAI_LONGITUDE = 78.1198;

function mapCandidate(w) {
  if (w.precipitation > 0.5 || (w.cloudCover >= 85 && w.humidity >= 80)) return { thinai: "kurinji", rule: "rain/mist" };
  if (w.temperature >= 28 && w.humidity < 70 && w.cloudCover < 50) return { thinai: "palai", rule: "temp>=28 & hum<70 & cloud<50 (NEW: cloud ceiling)" };
  if (w.cloudCover >= 60 && w.windSpeed < 10) return { thinai: "mullai", rule: "cloud>=60 & wind<10" };
  if (w.humidity >= 70) return { thinai: "neithal", rule: "hum>=70" };
  if (w.cloudCover < 40 && w.temperature >= 25 && w.temperature < 35) return { thinai: "marutham", rule: "cloud<40 & 25-35C" };
  return { thinai: "marutham", rule: "fallback" };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

(async () => {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${MADURAI_LATITUDE}&longitude=${MADURAI_LONGITUDE}` +
    `&start_date=${startDate}&end_date=${endDate}&hourly=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m&timezone=Asia%2FKolkata`;

  const res = await fetch(url);
  const data = await res.json();
  const h = data.hourly;

  const tally = { kurinji: 0, mullai: 0, marutham: 0, neithal: 0, palai: 0 };
  const rows = [];
  let todayResult = null;

  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].endsWith("T06:00")) continue;
    const w = {
      temperature: h.temperature_2m[i],
      humidity: h.relative_humidity_2m[i],
      precipitation: h.precipitation[i],
      cloudCover: h.cloud_cover[i],
      windSpeed: h.wind_speed_10m[i],
    };
    const { thinai } = mapCandidate(w);
    tally[thinai]++;
    rows.push(
      `${h.time[i].slice(0, 10)}  ${String(w.temperature).padStart(5)}C  hum ${String(w.humidity).padStart(3)}%  cloud ${String(w.cloudCover).padStart(3)}%  wind ${String(w.windSpeed).padStart(4)}kmh  -> ${thinai}`
    );
  }

  // Also check today's actual reading specifically
  const today = { temperature: 28.3, humidity: 59, precipitation: 0, cloudCover: 75, windSpeed: 8 };
  todayResult = mapCandidate(today);

  console.log(`CANDIDATE FIX — plain last 30 days (${startDate} to ${endDate}):\n`);
  rows.forEach((r) => console.log(r));

  console.log("\nDistribution under candidate fix:");
  const total = rows.length;
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(9)} ${String(v).padStart(2)}/${total}  (${((v / total) * 100).toFixed(0)}%)`);
  }

  console.log(`\nToday's actual reading (28.3C, 59% hum, 75% cloud, 8km/h wind) under candidate fix -> ${todayResult.thinai} (${todayResult.rule})`);
})();
