"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  applyMove,
  createInitialState,
  endJumpTurn,
  getLegalDestinationsForPiece,
  getProgressiveJumpDestinations,
  hasProgressiveJumpContinuation,
  pieceById,
  remainingRoyals,
  settleJumpSequence,
  tryApplyMove,
  type GameState,
  type LegalDestination,
  type Move,
  type Side,
  type Square,
} from "@halcontoro/engine";
import { Board } from "@/components/Board/Board";
import { ExitedRoyals } from "@/components/ExitedRoyals/ExitedRoyals";
import { sideLabel } from "@/lib/pieces";
import styles from "./LocalGame.module.css";

/** Must match Board piece CSS transition duration. */
const MOVE_MS = 400;

function resultMessage(state: GameState): string {
  if (!state.result) return "";
  const { winner, reason } = state.result;
  if (reason === "royals_exited" && winner) {
    return `${sideLabel(winner)} ניצח — כל המלכותיים הועברו ליעד`;
  }
  if (reason === "resign" && winner) {
    return `${sideLabel(winner)} ניצח — היריב נכנע`;
  }
  if (reason === "no_moves") return "תיקו — אין מהלכים חוקיים";
  if (reason === "threefold") return "תיקו — חזרה משולשת על אותה עמדה";
  if (reason === "draw_agreed") return "תיקו בהסכמה";
  return "המשחק הסתיים";
}

/** Move piece on board without switching turn — for the slide animation. */
function previewPieceMove(
  before: GameState,
  pieceId: string,
  to: Square,
): GameState {
  return {
    ...before,
    pieces: before.pieces.map((p) =>
      p.id === pieceId ? { ...p, position: { ...to } } : p,
    ),
  };
}

export function LocalGame() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"resign" | "draw" | null>(null);
  const [busy, setBusy] = useState(false);
  const animTimer = useRef<number | null>(null);

  const boardRotated = state.turn === "toro";
  const lockedPieceId = state.jumpSequence?.pieceId ?? null;
  const showJumpPrompt =
    !busy && hasProgressiveJumpContinuation(state);

  const selectedPiece = selectedId
    ? pieceById(state.pieces, selectedId)
    : undefined;

  const activePiece = lockedPieceId
    ? pieceById(state.pieces, lockedPieceId)
    : selectedPiece;

  const legalDests: LegalDestination[] = useMemo(() => {
    if (busy || !activePiece || state.status !== "playing") return [];
    if (state.jumpSequence) {
      return getProgressiveJumpDestinations(state);
    }
    return getLegalDestinationsForPiece(state, activePiece);
  }, [activePiece, state, busy]);

  const legalKeys = useMemo(
    () => new Set(legalDests.map((d) => `${d.to.x},${d.to.y}`)),
    [legalDests],
  );

  const clearAnimTimer = () => {
    if (animTimer.current !== null) {
      window.clearTimeout(animTimer.current);
      animTimer.current = null;
    }
  };

  const resetGame = useCallback(() => {
    clearAnimTimer();
    setBusy(false);
    setState(createInitialState());
    setSelectedId(null);
    setConfirm(null);
  }, []);

  const playMove = useCallback(
    (before: GameState, move: Move & { type: "step" | "jump" }) => {
      if (busy || before.status !== "playing") return;
      const result = tryApplyMove(before, move);
      if (!result.ok) return;

      const moved = pieceById(before.pieces, move.pieceId);
      const stillOnBoard = pieceById(result.state.pieces, move.pieceId);
      const royalExited = moved?.kind === "royal" && !stillOnBoard;

      // Slide first on the current board orientation, then commit engine state.
      setBusy(true);
      setSelectedId(null);
      setState(previewPieceMove(before, move.pieceId, move.to));

      clearAnimTimer();
      animTimer.current = window.setTimeout(() => {
        if (royalExited) {
          setState(result.state);
          setSelectedId(null);
        } else if (move.type === "jump") {
          if (hasProgressiveJumpContinuation(result.state)) {
            setState(result.state);
            setSelectedId(move.pieceId);
          } else {
            setState(settleJumpSequence(result.state));
            setSelectedId(null);
          }
        } else {
          setState(result.state);
          setSelectedId(null);
        }
        setBusy(false);
        animTimer.current = null;
      }, MOVE_MS);
    },
    [busy],
  );

  const onSelectSquare = useCallback(
    (sq: Square) => {
      if (busy || state.status !== "playing") return;

      if (lockedPieceId) {
        const dest = legalDests.find(
          (d) => d.to.x === sq.x && d.to.y === sq.y,
        );
        if (dest) {
          playMove(state, {
            type: dest.moveType,
            pieceId: lockedPieceId,
            to: dest.to,
          });
        }
        return;
      }

      const pieceOnSquare = state.pieces.find(
        (p) => p.position.x === sq.x && p.position.y === sq.y,
      );

      if (selectedId) {
        const dest = legalDests.find(
          (d) => d.to.x === sq.x && d.to.y === sq.y,
        );
        if (dest) {
          playMove(state, {
            type: dest.moveType,
            pieceId: selectedId,
            to: dest.to,
          });
          return;
        }
      }

      if (pieceOnSquare && pieceOnSquare.side === state.turn) {
        setSelectedId(pieceOnSquare.id);
        return;
      }

      setSelectedId(null);
    },
    [state, selectedId, legalDests, lockedPieceId, busy, playMove],
  );

  const onEndJump = () => {
    if (busy || !state.jumpSequence) return;
    setBusy(true);
    // End turn after a short beat so the last landing is visible.
    clearAnimTimer();
    animTimer.current = window.setTimeout(() => {
      setState(endJumpTurn(state));
      setSelectedId(null);
      setBusy(false);
      animTimer.current = null;
    }, 120);
  };

  const doResign = (side: Side) => {
    if (busy) return;
    setState(applyMove(state, { type: "resign", side }));
    setConfirm(null);
    setSelectedId(null);
  };

  const doDraw = () => {
    if (busy) return;
    setState(applyMove(state, { type: "agree_draw" }));
    setConfirm(null);
    setSelectedId(null);
  };

  const activeSelected = lockedPieceId ?? selectedId ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          HALCON-TORO
        </Link>
        <div className={styles.turnBadge} data-side={state.turn}>
          תור: {sideLabel(state.turn)}
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidePanel} data-side="toro">
          <h2>Toro</h2>
          <p className={styles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, "toro")} / 4
          </p>
          <ExitedRoyals side="toro" colors={state.exitedRoyals.toro} />
        </aside>

        <section className={styles.boardWrap}>
          <Board
            state={state}
            rotated={boardRotated}
            selectedId={activeSelected}
            legalKeys={legalKeys}
            onSelectSquare={onSelectSquare}
          />

          {showJumpPrompt && (
            <div className={styles.jumpBar}>
              <span>רצף קפיצות — ניתן להמשיך או לסיים</span>
              <button type="button" onClick={onEndJump} disabled={busy}>
                סיום תור
              </button>
            </div>
          )}
        </section>

        <aside className={styles.sidePanel} data-side="halcon">
          <h2>Halcon</h2>
          <p className={styles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, "halcon")} / 4
          </p>
          <ExitedRoyals side="halcon" colors={state.exitedRoyals.halcon} />
        </aside>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => setConfirm("resign")}
          disabled={busy}
        >
          כניעה
        </button>
        <button
          type="button"
          onClick={() => setConfirm("draw")}
          disabled={busy}
        >
          הצעת תיקו
        </button>
        <button type="button" className={styles.ghost} onClick={resetGame}>
          משחק חדש
        </button>
      </footer>

      {confirm === "resign" && (
        <div className={styles.modal}>
          <div className={styles.dialog}>
            <h3>מי נכנע?</h3>
            <p>היריב ינצח מיד.</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => doResign("halcon")}>
                Halcon נכנע
              </button>
              <button type="button" onClick={() => doResign("toro")}>
                Toro נכנע
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConfirm(null)}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm === "draw" && (
        <div className={styles.modal}>
          <div className={styles.dialog}>
            <h3>הצעת תיקו</h3>
            <p>השחקן השני מאשר?</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={doDraw}>
                אישור תיקו
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConfirm(null)}
              >
                דחייה
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === "ended" && !busy && (
        <div className={styles.modal}>
          <div className={styles.dialog}>
            <h3>סיום המשחק</h3>
            <p>{resultMessage(state)}</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={resetGame}>
                משחק חדש
              </button>
              <Link href="/" className={styles.linkBtn}>
                חזרה לתפריט
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
