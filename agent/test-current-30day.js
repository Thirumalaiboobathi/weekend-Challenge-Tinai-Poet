// Throwaway — plain last-30-days distribution against the CURRENTLY
// DEPLOYED code (dist/weatherThinai.js, the exact compiled output the
// Lambda runs), no blending with any other window.

const { mapWeatherToThinai } = require("./dist/weatherThinai.js");

const MADURAI_LATITUDE = 9.9252;
const MADURAI_LONGITUDE = 78.1198;

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

  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].endsWith("T06:00")) continue;
    const w = {
      time: h.time[i],
      temperature: h.temperature_2m[i],
      humidity: h.relative_humidity_2m[i],
      precipitation: h.precipitation[i],
      cloudCover: h.cloud_cover[i],
      windSpeed: h.wind_speed_10m[i],
    };
    const { thinai } = mapWeatherToThinai(w);
    tally[thinai]++;
    rows.push(
      `${h.time[i].slice(0, 10)}  ${String(w.temperature).padStart(5)}C  hum ${String(w.humidity).padStart(3)}%  cloud ${String(w.cloudCover).padStart(3)}%  wind ${String(w.windSpeed).padStart(4)}kmh  -> ${thinai}`
    );
  }

  console.log(`Madurai, plain last 30 days (${startDate} to ${endDate}), CURRENTLY DEPLOYED code:\n`);
  rows.forEach((r) => console.log(r));

  console.log("\nDistribution:");
  const total = rows.length;
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(9)} ${String(v).padStart(2)}/${total}  (${((v / total) * 100).toFixed(0)}%)`);
  }
})();
