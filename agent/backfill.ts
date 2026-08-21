// Phase 5: populates the 13 days before today with real historical
// weather so the /today archive shows a full 14-day grid instead of a
// single new entry. Run once, locally, with the same AWS credentials
// used throughout this project (not deployed as a Lambda — this is an
// administrative script, not part of the daily autonomous run).
//
// Every item this writes is stored with `backfilled: true` and is never
// allowed to overwrite a real (non-backfilled) entry — see backfillDate
// below. The UI (frontend/app/components/TodayScreen.tsx) checks this
// flag and renders a "Backfilled, not scheduled" badge on every one, so
// the archive never implies the schedule produced more history than it
// actually has.

import { fetchMaduraiWeatherForDate, mapWeatherToThinai } from "./weatherThinai";
import { THINAI } from "./thinai";
import { writeDailyStanza } from "./bedrock";
import { getDailyPoem, getRecentDailyPoems, putDailyPoem } from "./dynamo";

const BACKFILL_DAYS = 13; // + today's already-real entry = 14 in the archive

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function backfillDate(date: string): Promise<void> {
  const existing = await getDailyPoem(date);
  if (existing && !existing.backfilled) {
    console.log(JSON.stringify({ event: "backfill_skip_real_entry", date }));
    return;
  }

  const weather = await fetchMaduraiWeatherForDate(date);
  const { thinai, rule } = mapWeatherToThinai(weather);

  // Same same-thinai-only exclusion rule as the live agent (see
  // DECISIONS.md ADR on cross-thinai imagery contamination), scoped to
  // entries strictly before this date so a later backfilled day doesn't
  // "see" a day that, in real time, hadn't been written yet.
  const window = await getRecentDailyPoems(30);
  const recentImagery = window
    .filter((r) => r.date < date && r.thinai === thinai)
    .slice(0, 7)
    .flatMap((r) => r.imagery ?? []);

  const thinaiData = THINAI[thinai];
  const stanza = await writeDailyStanza(thinaiData, thinai, weather, recentImagery);

  await putDailyPoem({
    date,
    thinai,
    rule,
    weather,
    poem: stanza.english,
    poemTamil: stanza.tamil,
    imagery: stanza.imagery,
    createdAt: new Date().toISOString(),
    backfilled: true,
  });
  console.log(JSON.stringify({ event: "backfill_written", date, thinai }));
}

async function run(): Promise<void> {
  const today = todayIST();
  const dates: string[] = [];
  for (let i = BACKFILL_DAYS; i >= 1; i -= 1) {
    dates.push(subtractDays(today, i));
  }

  for (const date of dates) {
    try {
      await backfillDate(date);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ event: "backfill_failed", date, message }));
    }
  }
}

run();
