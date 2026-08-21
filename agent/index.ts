// Daily agent Lambda — invoked by EventBridge Scheduler at 06:00 IST,
// not by a public Function URL (so the new-account 403 guardrail hit
// earlier in this project does not apply here; see DECISIONS.md).
//
// Unlike the interactive app's API route, this Lambda is allowed to
// throw on failure: it's a batch job, not a user-facing request, so a
// thrown error becomes a visible Lambda invocation failure in
// CloudWatch — exactly the signal needed to know a scheduled run
// didn't produce a poem, rather than silently swallowing it.

import { fetchMaduraiWeather, mapWeatherToThinai } from "./weatherThinai";
import { THINAI } from "./thinai";
import { writeDailyStanza } from "./bedrock";
import { getRecentDailyPoems, putDailyPoem } from "./dynamo";
import type { DailyRecord } from "./dynamo";

function todayIST(): string {
  // en-CA gives YYYY-MM-DD directly.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function runDailyAgent(dateOverride?: string): Promise<DailyRecord> {
  const date = dateOverride ?? todayIST();
  const invokedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: "agent_invocation_start", date, invokedAt }));

  const weather = await fetchMaduraiWeather();
  const { thinai, rule } = mapWeatherToThinai(weather);
  console.log(JSON.stringify({ event: "weather_fetched", date, weather }));
  console.log(JSON.stringify({ event: "thinai_chosen", date, thinai, rule }));

  // Only exclude imagery from days that were ALSO this thinai. Cross-thinai
  // imagery was flattened in here too until a real run proved that unsafe:
  // Bedrock treated a palai day's excluded images ("palai flowers",
  // "vultures") as available material and wove them into a mullai poem
  // instead of avoiding them — negative constraints in a prompt can read
  // as a source list, not a blocklist. Filtering to same-thinai removes
  // the failure mode at the source (see DECISIONS.md ADR) and is also the
  // only case where "don't repeat yourself" is a meaningful ask, since
  // different thinai already draw from disjoint fixed vocabularies.
  const recent = await getRecentDailyPoems(7);
  const sameThinaiRecent = recent.filter((r) => r.thinai === thinai);
  const recentImagery = sameThinaiRecent.flatMap((r) => r.imagery ?? []);
  console.log(
    JSON.stringify({
      event: "imagery_excluded",
      date,
      lookbackDays: recent.length,
      sameThinaiDays: sameThinaiRecent.length,
      excludedCount: recentImagery.length,
      excluded: recentImagery,
    })
  );

  const thinaiData = THINAI[thinai];
  const stanza = await writeDailyStanza(thinaiData, thinai, weather, recentImagery);

  const record: DailyRecord = {
    date,
    thinai,
    rule,
    weather,
    poem: stanza.english,
    poemTamil: stanza.tamil,
    imagery: stanza.imagery,
    createdAt: new Date().toISOString(),
  };

  await putDailyPoem(record);
  console.log(JSON.stringify({ event: "dynamodb_write_confirmed", date, pk: `DAILY#${date}` }));
  console.log(JSON.stringify({ event: "agent_invocation_complete", date, thinai, imageryUsed: stanza.imagery }));

  return record;
}

// EventBridge Scheduler target — no input shape required.
export const handler = async () => {
  try {
    const record = await runDailyAgent();
    return { statusCode: 200, date: record.date, thinai: record.thinai };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "agent_invocation_failed", message }));
    throw err; // let Lambda mark this invocation failed — see header note
  }
};
