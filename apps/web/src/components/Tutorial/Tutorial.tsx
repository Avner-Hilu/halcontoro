"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  endJumpTurn,
  getLegalDestinationsForPiece,
  getProgressiveJumpDestinations,
  hasProgressiveJumpContinuation,
  pieceById,
  settleJumpSequence,
  tryApplyMove,
  type GameState,
  type LegalDestination,
  type Move,
  type Square,
} from "@halcontoro/engine";
import { Board } from "@/components/Board/Board";
import { ExitedRoyals } from "@/components/ExitedRoyals/ExitedRoyals";
import {
  boardForStep,
  TUTORIAL_STEPS,
  type TutorialStep,
  type TutorialStepId,
} from "@/lib/tutorial";
import styles from "./Tutorial.module.css";

const MOVE_MS = 400;

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

function squaresMatch(a: Square, b: Square) {
  return a.x === b.x && a.y === b.y;
}

function isSuccessMove(step: TutorialStep, to: Square, after: GameState): boolean {
  if (step.requireExitColor) {
    return after.exitedRoyals.halcon.includes(step.requireExitColor);
  }
  if (step.successSquares?.some((s) => squaresMatch(s, to))) {
    if (step.requireJumpCount && step.requireJumpCount > 1) {
      const pathLen = after.jumpSequence?.path.length ?? 0;
      // path includes start + landings; 2 jumps → start + 2 landings = 3
      return pathLen >= step.requireJumpCount + 1 || !after.jumpSequence;
    }
    return true;
  }
  return false;
}

export function Tutorial() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = TUTORIAL_STEPS[stepIdx]!;
  const [state, setState] = useState<GameState>(() => boardForStep(step.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const animTimer = useRef<number | null>(null);
  const jumpsDone = useRef(0);

  const goToStep = useCallback((idx: number) => {
    if (animTimer.current !== null) {
      window.clearTimeout(animTimer.current);
      animTimer.current = null;
    }
    const next = TUTORIAL_STEPS[idx]!;
    setStepIdx(idx);
    setState(boardForStep(next.id));
    setSelectedId(null);
    setBusy(false);
    setNudge(null);
    setJustCompleted(false);
    jumpsDone.current = 0;
  }, []);

  const lockedPieceId = state.jumpSequence?.pieceId ?? null;
  const showJumpPrompt =
    !busy &&
    step.kind === "practice" &&
    hasProgressiveJumpContinuation(state);

  const selectedPiece = selectedId
    ? pieceById(state.pieces, selectedId)
    : undefined;
  const activePiece = lockedPieceId
    ? pieceById(state.pieces, lockedPieceId)
    : selectedPiece;

  const legalDests: LegalDestination[] = useMemo(() => {
    if (busy || step.kind !== "practice" || !activePiece) return [];
    if (state.status !== "playing") return [];
    let dests = state.jumpSequence
      ? getProgressiveJumpDestinations(state)
      : getLegalDestinationsForPiece(state, activePiece);

    // Soft-guide: in practice, only highlight success / useful targets for focus piece.
    if (
      step.focusPieceId &&
      activePiece.id === step.focusPieceId &&
      step.successSquares &&
      !state.jumpSequence
    ) {
      const allowed = new Set(
        step.successSquares.map((s) => `${s.x},${s.y}`),
      );
      // For chain first hop, also allow the intermediate landing (2,3).
      if (step.id === "chain") {
        allowed.add("2,3");
      }
      const filtered = dests.filter((d) => allowed.has(`${d.to.x},${d.to.y}`));
      if (filtered.length > 0) dests = filtered;
    }
    if (step.id === "chain" && state.jumpSequence) {
      dests = dests.filter((d) => d.to.x === 2 && d.to.y === 5);
    }
    return dests;
  }, [activePiece, state, busy, step]);

  const legalKeys = useMemo(
    () => new Set(legalDests.map((d) => `${d.to.x},${d.to.y}`)),
    [legalDests],
  );

  const advanceAfterSuccess = useCallback(() => {
    setJustCompleted(true);
    setNudge(null);
    window.setTimeout(() => {
      if (stepIdx < TUTORIAL_STEPS.length - 1) {
        goToStep(stepIdx + 1);
      }
    }, 700);
  }, [goToStep, stepIdx]);

  const playMove = useCallback(
    async (move: Move) => {
      if (busy || move.type === "resign" || move.type === "agree_draw") return;
      const before = state;
      const result = tryApplyMove(before, move);
      if (!result.ok) {
        setNudge("המהלך לא חוקי — נסו שוב לפי ההנחיה.");
        return;
      }

      setBusy(true);
      setSelectedId(move.pieceId);
      setState(previewPieceMove(before, move.pieceId, move.to));
      setNudge(null);

      await new Promise<void>((r) => {
        animTimer.current = window.setTimeout(() => r(), MOVE_MS);
      });

      let next = result.state;
      if (move.type === "jump") {
        jumpsDone.current += 1;
      }

      if (next.jumpSequence && !hasProgressiveJumpContinuation(next)) {
        next = settleJumpSequence(next);
      }

      setState(next);
      setBusy(false);

      if (isSuccessMove(step, move.to, next)) {
        if (step.requireJumpCount && jumpsDone.current < step.requireJumpCount) {
          if (next.jumpSequence) {
            setNudge("יפה! עכשיו המשיכו לקפיצה השנייה.");
            return;
          }
        }
        if (
          step.requireJumpCount &&
          jumpsDone.current >= step.requireJumpCount
        ) {
          if (next.jumpSequence) {
            next = endJumpTurn(next);
            setState(next);
          }
          advanceAfterSuccess();
          return;
        }
        if (!step.requireJumpCount || step.requireExitColor) {
          advanceAfterSuccess();
        }
      }
    },
    [busy, state, step, advanceAfterSuccess],
  );

  const onSelectSquare = (sq: Square) => {
    if (busy || justCompleted || step.kind !== "practice") return;

    if (lockedPieceId) {
      const dest = legalDests.find(
        (d) => d.to.x === sq.x && d.to.y === sq.y,
      );
      if (!dest) {
        setNudge("בחרו משבצת מודגשת להמשך הקפיצה, או סיימו תור.");
        return;
      }
      void playMove({
        type: dest.moveType,
        pieceId: lockedPieceId,
        to: dest.to,
      });
      return;
    }

    const piece = state.pieces.find(
      (p) => p.position.x === sq.x && p.position.y === sq.y,
    );
    if (piece) {
      if (step.focusPieceId && piece.id !== step.focusPieceId) {
        setNudge(step.hint ?? "בחרו את הכלי שמסומן בהנחיה.");
        setSelectedId(null);
        return;
      }
      if (piece.side !== state.turn) {
        setNudge("זה כלי של הצד השני — בהדרכה משחקים עם Halcon.");
        return;
      }
      setSelectedId(piece.id);
      setNudge(null);
      return;
    }

    if (selectedId) {
      const dest = legalDests.find(
        (d) => d.to.x === sq.x && d.to.y === sq.y,
      );
      if (!dest) {
        setNudge("משבצת זו לא מתאימה לתרגיל — נסו משבצת מודגשת.");
        return;
      }
      void playMove({
        type: dest.moveType,
        pieceId: selectedId,
        to: dest.to,
      });
      return;
    }

    setNudge(step.hint ?? "בחרו כלי להמשך.");
  };

  const endJump = () => {
    if (!state.jumpSequence || busy) return;
    const next = endJumpTurn(state);
    setState(next);
    setSelectedId(null);
    if (
      step.requireJumpCount &&
      jumpsDone.current >= step.requireJumpCount
    ) {
      advanceAfterSuccess();
    } else if (step.id === "chain") {
      setNudge("בתרגיל הזה צריך שתי קפיצות — נסו שוב.");
      window.setTimeout(() => goToStep(stepIdx), 900);
    }
  };

  const progressPct = ((stepIdx + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← בית
        </Link>
        <div className={styles.progressWrap}>
          <span className={styles.progressLabel}>
            שלב {stepIdx + 1} מתוך {TUTORIAL_STEPS.length}
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.lesson}>
          <p className={styles.kicker}>הדרכה</p>
          <h1 className={styles.title}>{step.title}</h1>
          <p className={styles.body}>{step.body}</p>
          {step.hint && step.kind === "practice" && !justCompleted && (
            <p className={styles.hint}>{step.hint}</p>
          )}
          {nudge && <p className={styles.nudge}>{nudge}</p>}
          {justCompleted && (
            <p className={styles.success}>כל הכבוד — ממשיכים…</p>
          )}

          {step.kind === "info" && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => goToStep(stepIdx + 1)}
            >
              המשך
            </button>
          )}

          {step.kind === "done" && (
            <div className={styles.doneActions}>
              <Link className={styles.primary} href="/play/ai">
                משחק מול המחשב
              </Link>
              <Link className={styles.secondary} href="/play/local">
                משחק מקומי לשניים
              </Link>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => goToStep(0)}
              >
                להתחיל הדרכה מחדש
              </button>
            </div>
          )}

          {step.kind === "practice" && (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => goToStep(stepIdx)}
            >
              איפוס שלב
            </button>
          )}
        </aside>

        <div className={styles.boardCol}>
          {state.exitedRoyals.halcon.length > 0 && (
            <div className={styles.exitRack}>
              <ExitedRoyals
                side="halcon"
                colors={state.exitedRoyals.halcon}
                compact
              />
            </div>
          )}
          <Board
            state={state}
            rotated={false}
            selectedId={selectedId}
            legalKeys={legalKeys}
            onSelectSquare={onSelectSquare}
          />
          {showJumpPrompt && (
            <div className={styles.jumpBar}>
              <span>אפשר להמשיך לקפוץ</span>
              <button type="button" onClick={endJump} disabled={busy}>
                סיום תור
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Exported for tests / deep links */
export function tutorialStepIdAt(index: number): TutorialStepId {
  return TUTORIAL_STEPS[index]?.id ?? "goal";
}
