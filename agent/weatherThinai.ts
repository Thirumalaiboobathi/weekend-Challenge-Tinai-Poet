// Deterministic weather -> thinai mapping for the daily agent.
//
// This is code, not model judgement — Bedrock never decides which
// landscape today's weather maps to, the same "never invent, only
// select" guarantee the rest of the app is built on (see thinai.ts).
// Rules are evaluated in order, first match wins, so there is no
// ambiguity from overlapping conditions.
//
// Classical grounding for each rule is in the comment beside it.
// Sangam poetics already binds each thinai to a season/weather
// register (Tholkappiyam's "mudal" and "karu" categories include
// season and time of day alongside landscape) — this mapping is an
// application of that existing structure to a real daily reading,
// not an invented one.

import type { ThinaiKey } from "./thinai";
export type { ThinaiKey };

export interface WeatherReading {
  time: string; // ISO timestamp of the reading, as returned by Open-Meteo
  temperature: number; // °C, 2m air temperature
  humidity: number; // % relative humidity, 2m
  precipitation: number; // mm, most recent hour
  cloudCover: number; // % total cloud cover
  windSpeed: number; // km/h, 10m wind speed
}

export interface ThinaiMapping {
  thinai: ThinaiKey;
  rule: string;
}

// Ordered, deterministic, first-match-wins. Thresholds are chosen for
// Madurai's actual climate (hot semi-arid interior Tamil Nadu — real
// coastal humidity never occurs here, so "neithal" fires on humid,
// still, non-rainy air, i.e. the *feel* Sangam neithal imagery evokes,
// not literal coastline).
export function mapWeatherToThinai(w: WeatherReading): ThinaiMapping {
  if (w.precipitation > 0.5 || (w.cloudCover >= 85 && w.humidity >= 80)) {
    // Rain actually falling, or thick low cloud with saturated air (mist).
    // Kurinji is the monsoon-adjacent mountain landscape in Sangam
    // convention — waterfalls, wet bamboo groves, rain-fed blooms.
    return {
      thinai: "kurinji",
      rule: "precipitation > 0.5mm, or cloud cover ≥85% with humidity ≥80% — rain or mist",
    };
  }

  if (w.temperature >= 28 && w.humidity < 70 && w.cloudCover < 50) {
    // Hot and dry: the wasteland register — scorched scrub, blazing
    // open sky, no relief. Thresholds are dawn-calibrated, not
    // afternoon-calibrated: the agent only ever reads at 06:00 IST,
    // the daily temperature minimum and humidity maximum, so a "35°C
    // and <40% humidity" threshold (true afternoon dry-heat) never
    // fires at dawn in Madurai in any season — confirmed against both
    // a monsoon-adjacent month and April, the hottest month of the
    // year, where dawn still never exceeded 28.9°C or dropped below
    // 64% humidity. 28°C/<70% humidity is calibrated to the
    // warm-and-relatively-dry end of what dawn actually produces here.
    //
    // The cloudCover < 50% clause was added after a real deployed run
    // mapped a 75%-cloud, 28.3°C morning to palai and generated a
    // drought/vulture poem on an overcast day — a genuine correctness
    // bug (temperature/humidity alone can't tell "dry heat" apart from
    // "cloudy and mild"), not a style issue. With this clause, palai
    // is rare in this climate (confirmed: ~2% combined across a
    // monsoon-adjacent month and April) because a dawn that's
    // simultaneously warm, dry, AND clear is genuinely rare here — and
    // that rarity is correct, not a bug to compensate for. Palai is
    // the wasteland; it should be the extreme, not a default.
    return {
      thinai: "palai",
      rule: "temperature ≥28°C, humidity <70%, and cloud cover <50% — genuinely dry, clear dawn heat",
    };
  }

  if (w.cloudCover >= 60 && w.windSpeed < 10) {
    // Overcast but calm, no rain, no wind — the gathering-cloud,
    // waiting-for-rain register of mullai's pastoral evenings. Checked
    // before neithal's plain-humidity rule below: at Madurai dawns,
    // heavy cloud cover and high humidity co-occur often enough that
    // checking humidity first would swallow most of mullai's genuine
    // territory (30-day validation: humidity-first pushed neithal to
    // 48% of days and left mullai underrepresented). Cloud+stillness
    // is the more specific signal, so it gets first claim.
    return {
      thinai: "mullai",
      rule: "cloud cover ≥60% and wind <10 km/h — overcast and still",
    };
  }

  if (w.humidity >= 70) {
    // Muggy, saturated air without rain falling and not the
    // cloud-and-stillness of mullai above — the heavy, briny register
    // neithal's shoreline imagery carries, independent of actual
    // proximity to the coast.
    return {
      thinai: "neithal",
      rule: "humidity ≥70% without rain — high humidity",
    };
  }

  if (w.cloudCover < 40 && w.temperature >= 25 && w.temperature < 35) {
    // Clear skies, comfortable warmth — fair-weather agricultural
    // conditions, marutham's river-plain register.
    return {
      thinai: "marutham",
      rule: "cloud cover <40% and 25–35°C — clear and warm",
    };
  }

  // Documented fallback: nothing above matched cleanly (e.g. cool and
  // clear, or moderate cloud with moderate humidity). Marutham is the
  // fallback deliberately, not arbitrarily — of the five, it is the
  // one tied to ordinary settled farmland weather rather than an
  // extreme (rain, heat, humidity, stillness), making it the most
  // weather-neutral default when no threshold clearly fires.
  return {
    thinai: "marutham",
    rule: "fallback — no threshold matched; marutham (fair-weather farmland) is the weather-neutral default",
  };
}

const MADURAI_LATITUDE = 9.9252;
const MADURAI_LONGITUDE = 78.1198;

// Current conditions only (Phase 1 scope). Historical/backfill fetch
// is a separate function added in Phase 5, against Open-Meteo's
// archive API rather than this forecast endpoint.
export async function fetchMaduraiWeather(): Promise<WeatherReading> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${MADURAI_LATITUDE}&longitude=${MADURAI_LONGITUDE}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m` +
    `&timezone=Asia%2FKolkata`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const c = data.current;
  if (!c) {
    throw new Error("Open-Meteo response missing 'current' block");
  }

  return {
    time: c.time,
    temperature: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    windSpeed: c.wind_speed_10m,
  };
}
