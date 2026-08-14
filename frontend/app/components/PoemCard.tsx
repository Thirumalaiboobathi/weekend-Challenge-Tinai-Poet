import type { CSSProperties, ReactNode } from "react";
import type { ThinaiEntry } from "@/lib/thinai";
import styles from "./PoemCard.module.css";

interface PoemCardProps {
  poem: string;
  poemTamil?: string;
  thinaiData?: ThinaiEntry;
  badgeLabel?: string;
  children?: ReactNode;
}

// Renders the tinted poem card shared by Create and Play (post-reveal).
// With no thinaiData it renders neutral and un-badged — used by Play
// before the reveal, so the card itself never leaks the answer.
// poemTamil is optional: only the Bedrock path produces it, so the
// fallback path (or an unavailable retry) just shows English.
export default function PoemCard({ poem, poemTamil, thinaiData, badgeLabel, children }: PoemCardProps) {
  const cardStyle = thinaiData
    ? ({
        "--card-bg": thinaiData.palette.background,
        "--card-accent": thinaiData.palette.accent,
        "--card-text": thinaiData.palette.text,
      } as CSSProperties)
    : undefined;

  return (
    <div className={styles.card} style={cardStyle}>
      <div className={styles.cardInner} key={poem}>
        {thinaiData && <span className={styles.badge}>{badgeLabel ?? thinaiData.landscape}</span>}
        {poemTamil && <p className={styles.poemTamil}>{poemTamil}</p>}
        <p className={styles.poem}>{poem}</p>
        {children}
      </div>
    </div>
  );
}
