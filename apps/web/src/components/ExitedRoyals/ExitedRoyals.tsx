"use client";

import type { PieceColor, Side } from "@halcontoro/engine";
import { pieceImageSrc } from "@/lib/pieces";
import styles from "./ExitedRoyals.module.css";

interface ExitedRoyalsProps {
  side: Side;
  colors: PieceColor[];
  /** Compact row — for tutorial / narrow strips. */
  compact?: boolean;
}

const COLOR_ORDER: PieceColor[] = ["red", "orange", "blue", "green"];

export function ExitedRoyals({ side, colors, compact = false }: ExitedRoyalsProps) {
  const exited = new Set(colors);

  return (
    <div
      className={[styles.rack, compact ? styles.rackCompact : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={`מלכותיים שיצאו — ${side}`}
    >      {COLOR_ORDER.map((color) => {
        const done = exited.has(color);
        return (
          <div
            key={`${side}-${color}`}
            className={[styles.slot, done ? styles.filled : styles.empty]
              .filter(Boolean)
              .join(" ")}
          >
            {done ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.piece}
                src={pieceImageSrc({
                  id: `${side}-royal-${color}`,
                  side,
                  kind: "royal",
                  color,
                  position: { x: 0, y: 0 },
                })}
                alt={`${side} royal ${color}`}
              />
            ) : (
              <span className={styles.placeholder} aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
