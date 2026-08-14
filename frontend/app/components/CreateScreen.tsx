"use client";

import { useState } from "react";
import type { ThinaiEntry } from "@/lib/thinai";
import PoemCard from "./PoemCard";
import styles from "./CreateScreen.module.css";

interface CreateResult {
  poem: string;
  poemTamil?: string;
  thinai: string;
  thinaiData: ThinaiEntry;
  reason: string;
}

type Status = "idle" | "loading" | "error";

export default function CreateScreen() {
  const [situation, setSituation] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!situation.trim() || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/tinai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", situation }),
      });
      const payload = await res.json();

      if (!res.ok || payload.error) {
        setStatus("error");
        setErrorMessage(payload.message || "Something went wrong. Try again.");
        return;
      }

      setResult(payload as CreateResult);
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <>
      <p className={styles.subtitle}>
        Describe a situation. It will be read into one of five classical Tamil landscapes.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="situation">
          Your situation
        </label>
        <textarea
          id="situation"
          className={styles.textarea}
          placeholder="waiting on interview results, moved away from my hometown, a long-distance relationship…"
          value={situation}
          maxLength={400}
          onChange={(e) => setSituation(e.target.value)}
        />
        <button className={styles.submit} type="submit" disabled={status === "loading" || !situation.trim()}>
          {status === "loading" ? "Reading the landscape…" : "Write the poem"}
        </button>
      </form>

      {status === "error" && <p className={styles.error}>{errorMessage}</p>}

      {result && (
        <div className={styles.result}>
          <PoemCard poem={result.poem} poemTamil={result.poemTamil} thinaiData={result.thinaiData}>
            <details className={styles.details}>
              <summary className={styles.summary}>Why this landscape</summary>
              <p className={styles.reason}>{result.reason}</p>
            </details>
          </PoemCard>
        </div>
      )}
    </>
  );
}
