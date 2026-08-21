// Throwaway verification script — not shipped code. Runs the mapping
// against 60 days of real historical Open-Meteo data for Madurai
// (April = hot-dry season, plus the most recent 30 days = monsoon-
// adjacent), taking the hourly reading closest to 06:00 IST each day
// (matching what the scheduled agent will actually see at dawn).

import { mapWeatherToThinai } from "./weatherThinai.ts";
import type { WeatherReading } from "./weatherThinai.ts";

const MADURAI_LATITUDE = 9.9252;
const MADURAI_LONGITUDE = 78.1198;

async function fetchDawnReadings(startDate: string, endDate: string): Promise<{ date: string; w: WeatherReading }[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${MADURAI_LATITUDE}&longitude=${MADURAI_LONGITUDE}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m` +
    `&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive request failed: ${res.status}`);
  const data = await res.json();
  const h = data.hourly;
  const out: { date: string; w: WeatherReading }[] = [];
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].endsWith("T06:00")) continue;
    out.push({
      date: h.time[i].slice(0, 10),
      w: {
        time: h.time[i],
        temperature: h.temperature_2m[i],
        humidity: h.relative_humidity_2m[i],
        precipitation: h.precipitation[i],
        cloudCover: h.cloud_cover[i],
        windSpeed: h.wind_speed_10m[i],
      },
    });
  }
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

(async () => {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  const [aprilRows, recentRows] = await Promise.all([
    fetchDawnReadings("2026-04-01", "2026-04-30"),
    fetchDawnReadings(isoDate(start), isoDate(end)),
  ]);

  const allRows = [...aprilRows, ...recentRows];
  const tally: Record<string, number> = { kurinji: 0, mullai: 0, marutham: 0, neithal: 0, palai: 0 };

  for (const { w } of allRows) {
    tally[mapWeatherToThinai(w).thinai]++;
  }

  console.log(`Combined: ${allRows.length} days (April 2026 hot season + last 30 days), 06:00 IST reading each day\n`);
  console.log("Distribution:");
  const total = allRows.length;
  for (const [k, v] of Object.entries(tally)) {
    const pct = total ? ((v / total) * 100).toFixed(0) : "0";
    console.log(`  ${k.padEnd(9)} ${String(v).padStart(2)}/${total}  (${pct}%)`);
  }
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
