"use client";

import { useEffect, useState } from "react";
import type { ThinaiEntry } from "@/lib/thinai";
import PoemCard from "./PoemCard";
import styles from "./GalleryScreen.module.css";

interface GalleryPoem {
  id: string;
  situation: string;
  thinai: string;
  poem: string;
  poemTamil?: string;
  reason: string;
  createdAt: string;
  thinaiData: ThinaiEntry;
}

export default function GalleryScreen() {
  const [poems, setPoems] = useState<GalleryPoem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/tinai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "gallery" }),
        });
        const payload = await res.json();

        if (cancelled) return;

        if (!res.ok || payload.error) {
          setError(payload.message || "Something went wrong loading the gallery.");
          return;
        }

        setPoems(payload.poems as GalleryPoem[]);
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
      <p className={styles.subtitle}>The most recent poems written in Create, most recent first.</p>

      {error && <p className={styles.error}>{error}</p>}

      {!error && poems === null && <p className={styles.loading}>Loading the gallery…</p>}

      {poems !== null && poems.length === 0 && (
        <p className={styles.empty}>No poems yet — write one in Create and it will show up here.</p>
      )}

      {poems !== null && poems.length > 0 && (
        <div className={styles.grid}>
          {poems.map((p) => (
            <PoemCard key={p.id} poem={p.poem} poemTamil={p.poemTamil} thinaiData={p.thinaiData}>
              <p className={styles.situation}>{p.situation}</p>
            </PoemCard>
          ))}
        </div>
      )}
    </>
  );
}
