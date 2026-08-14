"use client";

import { useState } from "react";
import CreateScreen from "./components/CreateScreen";
import PlayScreen from "./components/PlayScreen";
import GalleryScreen from "./components/GalleryScreen";
import styles from "./page.module.css";

type Tab = "create" | "play" | "gallery";

const TABS: { key: Tab; label: string }[] = [
  { key: "create", label: "Create" },
  { key: "play", label: "Play" },
  { key: "gallery", label: "Gallery" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("create");
  const [sessionId] = useState(() => crypto.randomUUID());

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tinai Poet</h1>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "create" && <CreateScreen />}
      {tab === "play" && <PlayScreen sessionId={sessionId} />}
      {tab === "gallery" && <GalleryScreen />}
    </main>
  );
}
