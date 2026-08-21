import { fetchMaduraiWeather, mapWeatherToThinai } from "./weatherThinai.ts";

(async () => {
  const weather = await fetchMaduraiWeather();
  const mapping = mapWeatherToThinai(weather);

  console.log("Madurai weather right now:");
  console.log(JSON.stringify(weather, null, 2));
  console.log("");
  console.log("Mapped thinai:", mapping.thinai);
  console.log("Rule fired:", mapping.rule);
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
