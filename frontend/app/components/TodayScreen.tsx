"use client";

import { useEffect, useState } from "react";
import type { ThinaiEntry } from "@/lib/thinai";
import PoemCard from "./PoemCard";
import styles from "./TodayScreen.module.css";

interface DailyWeatherReading {
  temperature: number;
  humidity: number;
  cloudCover: number;
  windSpeed: number;
}

interface DailyEntry {
  date: string;
  thinai: string;
  rule: string;
  weather: DailyWeatherReading;
  poem: string;
  poemTamil?: string;
  backfilled?: boolean;
  thinaiData: ThinaiEntry;
}

// Short landscape word for the one-line mapping explanation — display-only,
// so kept local rather than adding a fourth copy of thinai.ts for one field.
const LANDSCAPE_SHORT: Record<string, string> = {
  kurinji: "mountains",
  mullai: "pasture",
  marutham: "farmland",
  neithal: "shore",
  palai: "wasteland",
};

// Rule strings end with a plain-English descriptor after an em dash (see
// agent/weatherThinai.ts) — reused here instead of writing a second
// explanation of the same mapping logic.
function ruleDescriptor(rule: string): string {
  if (rule.startsWith("fallback")) return "no other landscape's conditions matched";
  const idx = rule.lastIndexOf("—");
  return idx >= 0 ? rule.slice(idx + 1).trim() : rule;
}

function mappingLine(entry: DailyEntry): string {
  const { temperature, cloudCover } = entry.weather;
  const landscape = LANDSCAPE_SHORT[entry.thinai] ?? entry.thinaiData.landscape.toLowerCase();
  return `${temperature}°C, ${cloudCover}% cloud — ${ruleDescriptor(entry.rule)} — ${entry.thinai}, the ${landscape}`;
}

function weatherLine(w: DailyWeatherReading): string {
  return `${w.temperature}°C · ${w.humidity}% humidity · ${w.cloudCover}% cloud · ${w.windSpeed} km/h wind`;
}

export default function TodayScreen() {
  const [today, setToday] = useState<DailyEntry | null | undefined>(undefined);
  const [archive, setArchive] = useState<DailyEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/tinai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "today" }),
        });
        const payload = await res.json();

        if (cancelled) return;

        if (!res.ok || payload.error) {
          setError(payload.message || "Something went wrong loading today's poem.");
          return;
        }

        setToday(payload.today as DailyEntry | null);
        setArchive(payload.archive as DailyEntry[]);
      } catch {
        if (!cancelled) {
          setError("Couldn't reach the server. Check your connection and try again.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <p className={styles.subtitle}>
        Written once a day at dawn from Madurai&apos;s real weather — see the archive below.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {!error && today === undefined && <p className={styles.loading}>Loading today&apos;s poem…</p>}

      {!error && today === null && (
        <p className={styles.empty}>Today&apos;s poem hasn&apos;t been generated yet — check back after 06:00 IST.</p>
      )}

      {today && (
        <div className={styles.todayCard}>
          <PoemCard poem={today.poem} poemTamil={today.poemTamil} thinaiData={today.thinaiData} badgeLabel={today.date}>
            <p className={styles.weatherLine}>{weatherLine(today.weather)}</p>
            <p className={styles.mappingLine}>{mappingLine(today)}</p>
            {today.backfilled && <span className={styles.backfilledBadge}>Backfilled, not scheduled</span>}
          </PoemCard>
        </div>
      )}

      {archive !== null && archive.length > 0 && (
        <>
          <h2 className={styles.archiveHeading}>Archive</h2>
          <div className={styles.grid}>
            {archive.map((entry) => (
              <PoemCard
                key={entry.date}
                poem={entry.poem}
                poemTamil={entry.poemTamil}
                thinaiData={entry.thinaiData}
                badgeLabel={entry.date}
              >
                <p className={styles.weatherLine}>{weatherLine(entry.weather)}</p>
                {entry.backfilled && <span className={styles.backfilledBadge}>Backfilled, not scheduled</span>}
              </PoemCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}
