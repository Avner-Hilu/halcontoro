"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BOARD_SIZE,
  type GameState,
  type Piece,
  type Square,
} from "@halcontoro/engine";
import { pieceImageSrc } from "@/lib/pieces";
import styles from "./Board.module.css";

interface BoardProps {
  state: GameState;
  rotated: boolean;
  selectedId: string | null;
  legalKeys: Set<string>;
  onSelectSquare: (sq: Square) => void;
}

function logicalToVisual(
  sq: Square,
  rotated: boolean,
): { col: number; row: number } {
  if (!rotated) {
    return { col: sq.x, row: BOARD_SIZE - 1 - sq.y };
  }
  return { col: BOARD_SIZE - 1 - sq.x, row: sq.y };
}

function visualToLogical(
  col: number,
  rowFromTop: number,
  rotated: boolean,
): Square {
  if (!rotated) {
    return { x: col, y: BOARD_SIZE - 1 - rowFromTop };
  }
  return { x: BOARD_SIZE - 1 - col, y: rowFromTop };
}

export function Board({
  state,
  rotated,
  selectedId,
  legalKeys,
  onSelectSquare,
}: BoardProps) {
  const [motionEnabled, setMotionEnabled] = useState(true);
  const prevRotated = useRef(rotated);

  // When the board flips for the other player, snap pieces — don't tween the flip.
  useEffect(() => {
    if (prevRotated.current === rotated) return;
    prevRotated.current = rotated;
    setMotionEnabled(false);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setMotionEnabled(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [rotated]);

  const bySquare = new Map<string, Piece>(
    state.pieces.map((p) => [`${p.position.x},${p.position.y}`, p]),
  );

  const pathKeys = new Set(
    (state.jumpSequence?.path ?? []).map((s) => `${s.x},${s.y}`),
  );

  const topLabel = rotated ? "יעד Toro" : "יעד Halcon";
  const bottomLabel = rotated ? "יעד Halcon" : "יעד Toro";

  const cells: ReactNode[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const sq = visualToLogical(col, row, rotated);
      const key = `${sq.x},${sq.y}`;
      const piece = bySquare.get(key);
      const dark = (sq.x + sq.y) % 2 === 1;
      const isLegal = legalKeys.has(key);
      const isSelected = Boolean(piece && piece.id === selectedId);
      const onPath = pathKeys.has(key);

      cells.push(
        <button
          key={`cell-${key}`}
          type="button"
          className={[
            styles.cell,
            dark ? styles.dark : styles.light,
            isLegal ? styles.legal : "",
            isSelected ? styles.selected : "",
            onPath ? styles.path : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onSelectSquare(sq)}
          aria-label={`משבצת ${String.fromCharCode(97 + sq.x)}${sq.y + 1}`}
        >
          {isLegal && !piece && <span className={styles.dot} />}
        </button>,
      );
    }
  }

  return (
    <div className={styles.boardShell}>
      <div className={styles.board} role="grid" aria-label="לוח משחק" dir="ltr">
        {cells}
      </div>

      <div
        className={[
          styles.piecesLayer,
          motionEnabled ? "" : styles.noMotion,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {state.pieces.map((piece) => (
          <PieceToken
            key={piece.id}
            piece={piece}
            rotated={rotated}
            selected={piece.id === selectedId}
          />
        ))}
      </div>

      <div className={styles.targetLines} aria-hidden>
        <div className={`${styles.line} ${styles.lineTop}`}>
          <span className={styles.lineLabel}>{topLabel}</span>
        </div>
        <div className={`${styles.line} ${styles.lineBottom}`}>
          <span className={styles.lineLabel}>{bottomLabel}</span>
        </div>
      </div>
    </div>
  );
}

function PieceToken({
  piece,
  rotated,
  selected,
}: {
  piece: Piece;
  rotated: boolean;
  selected: boolean;
}) {
  const { col, row } = logicalToVisual(piece.position, rotated);
  return (
    <div
      className={[styles.pieceToken, selected ? styles.pieceSelected : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
      }}
      data-side={piece.side}
      data-kind={piece.kind}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pieceImageSrc(piece)}
        alt={`${piece.side} ${piece.kind} ${piece.color}`}
        draggable={false}
      />
    </div>
  );
}
