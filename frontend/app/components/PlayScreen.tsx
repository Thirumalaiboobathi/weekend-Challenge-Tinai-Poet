"use client";

import { useCallback, useEffect, useState } from "react";
import { THINAI, THINAI_KEYS, ThinaiKey } from "@/lib/thinai";
import PoemCard from "./PoemCard";
import styles from "./PlayScreen.module.css";

interface Round {
  poem: string;
  poemTamil?: string;
  answer: ThinaiKey;
  giveaway: string;
}

interface PlayScreenProps {
  sessionId: string;
}

export default function PlayScreen({ sessionId }: PlayScreenProps) {
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guess, setGuess] = useState<ThinaiKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const loadRound = useCallback(async () => {
    setLoading(true);
    setError("");
    setGuess(null);
    setRevealed(false);
    setCorrect(null);

    try {
      const res = await fetch("/api/tinai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "play" }),
      });
      const payload = await res.json();

      if (!res.ok || payload.error) {
        setError(payload.message || "Something went wrong. Try again.");
        setRound(null);
        return;
      }

      setRound(payload as Round);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  async function handleGuess(key: ThinaiKey) {
    if (!round || revealed) return;

    const isCorrect = key === round.answer;
    setGuess(key);
    setCorrect(isCorrect);
    setRevealed(true);

    try {
      const res = await fetch("/api/tinai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "score", sessionId, correct: isCorrect }),
      });
      const payload = await res.json();
      if (res.ok && !payload.error) {
        setCurrentStreak(payload.currentStreak);
        setBestStreak(payload.bestStreak);
      }
    } catch {
      // Streak persistence is non-critical to the guessing game itself;
      // the local reveal already happened, so fail silently here.
    }
  }

  const revealedThinaiData = revealed && round ? THINAI[round.answer] : undefined;

  return (
    <>
      <p className={styles.subtitle}>Guess which landscape the poem is hiding.</p>

      <div className={styles.streakRow}>
        <div className={styles.streakItem}>
          <span className={styles.streakValue}>{currentStreak}</span>
          <span className={styles.streakLabel}>Streak</span>
        </div>
        <div className={styles.streakItem}>
          <span className={styles.streakValue}>{bestStreak}</span>
          <span className={styles.streakLabel}>Best</span>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !round && <p className={styles.loading}>Reading the landscape…</p>}

      {round && (
        <>
          <PoemCard poem={round.poem} poemTamil={round.poemTamil} thinaiData={revealedThinaiData}>
            {revealed && (
              <div className={styles.reveal}>
                <p className={styles.resultLine}>
                  {correct ? "Correct." : "Not quite."} The answer was{" "}
                  {THINAI[round.answer].landscape.toLowerCase()}.
                </p>
                <p className={styles.giveawayLine}>The giveaway: {round.giveaway}.</p>
              </div>
            )}
          </PoemCard>

          <div className={styles.buttonsGrid}>
            {THINAI_KEYS.map((key) => {
              const isAnswer = revealed && key === round.answer;
              const isWrongGuess = revealed && key === guess && key !== round.answer;
              const buttonStyle = isAnswer
                ? {
                    background: THINAI[key].palette.accent,
                    borderColor: THINAI[key].palette.accent,
                    color: THINAI[key].palette.background,
                    opacity: 1,
                  }
                : undefined;

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.guessButton} ${isWrongGuess ? styles.wrong : ""}`}
                  style={buttonStyle}
                  onClick={() => handleGuess(key)}
                  disabled={revealed || loading}
                >
                  {THINAI[key].landscape}
                </button>
              );
            })}
          </div>

          {revealed && (
            <button className={styles.nextButton} type="button" onClick={loadRound}>
              Next poem
            </button>
          )}
        </>
      )}
    </>
  );
}
