import { mapWeatherToThinai } from "./weatherThinai.ts";
import type { WeatherReading } from "./weatherThinai.ts";

const cases: { label: string; w: WeatherReading }[] = [
  { label: "monsoon downpour", w: { time: "t", temperature: 26, humidity: 90, precipitation: 4, cloudCover: 95, windSpeed: 12 } },
  { label: "thick still mist, no rain yet", w: { time: "t", temperature: 24, humidity: 85, precipitation: 0, cloudCover: 90, windSpeed: 5 } },
  { label: "peak dry heat", w: { time: "t", temperature: 38, humidity: 25, precipitation: 0, cloudCover: 15, windSpeed: 10 } },
  { label: "muggy, no rain", w: { time: "t", temperature: 30, humidity: 75, precipitation: 0, cloudCover: 40, windSpeed: 8 } },
  { label: "overcast, calm, cool-ish", w: { time: "t", temperature: 27, humidity: 55, precipitation: 0, cloudCover: 70, windSpeed: 6 } },
  { label: "clear warm day", w: { time: "t", temperature: 30, humidity: 45, precipitation: 0, cloudCover: 20, windSpeed: 14 } },
  { label: "cool clear (fallback expected)", w: { time: "t", temperature: 20, humidity: 50, precipitation: 0, cloudCover: 30, windSpeed: 15 } },
];

for (const { label, w } of cases) {
  const { thinai, rule } = mapWeatherToThinai(w);
  console.log(`${label.padEnd(32)} -> ${thinai.padEnd(9)} (${rule})`);
}
