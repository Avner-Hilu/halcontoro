"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type AiDifficulty,
  type AiTurn,
  type GameState,
  type LegalDestination,
  type Move,
  type Side,
  type Square,
} from "@halcontoro/engine";
import { Board } from "@/components/Board/Board";
import { ExitedRoyals } from "@/components/ExitedRoyals/ExitedRoyals";
import { requestAiTurn } from "@/lib/aiClient";
import { sideLabel } from "@/lib/pieces";
import styles from "../LocalGame/LocalGame.module.css";
import setupStyles from "./AiGame.module.css";

const MOVE_MS = 400;

const DIFFICULTY_LABEL: Record<AiDifficulty, string> = {
  beginner: "מתחיל",
  intermediate: "מתקדם",
  expert: "מומחה",
  master: "מאסטר",
};

const DIFFICULTY_ORDER: AiDifficulty[] = [
  "beginner",
  "intermediate",
  "expert",
  "master",
];

function resultMessage(state: GameState, humanSide: Side): string {
  if (!state.result) return "";
  const { winner, reason } = state.result;
  if (reason === "royals_exited" && winner) {
    return winner === humanSide
      ? "ניצחת! כל המלכותיים שלך הגיעו ליעד"
      : "המחשב ניצח — המלכותיים שלו הגיעו ליעד";
  }
  if (reason === "resign" && winner) {
    return winner === humanSide ? "ניצחת — המחשב נכנע" : "הפסדת — נכנעת";
  }
  if (reason === "no_moves") return "תיקו — אין מהלכים חוקיים";
  if (reason === "threefold") return "תיקו — חזרה משולשת";
  if (reason === "draw_agreed") return "תיקו בהסכמה";
  return "המשחק הסתיים";
}

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

function sleep(ms: number) {
  return new Promise<void>((r) => {
    window.setTimeout(r, ms);
  });
}

export function AiGame() {
  const [started, setStarted] = useState(false);
  const [humanSide, setHumanSide] = useState<Side>("halcon");
  const [difficulty, setDifficulty] = useState<AiDifficulty>("beginner");
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const animLock = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const aiSide: Side = humanSide === "halcon" ? "toro" : "halcon";
  // Human always sits at the bottom of the screen.
  const boardRotated = humanSide === "toro";
  const humanToMove =
    state.status === "playing" && state.turn === humanSide && !busy && !thinking;

  const lockedPieceId =
    state.jumpSequence && state.turn === humanSide
      ? state.jumpSequence.pieceId
      : null;

  const showJumpPrompt =
    humanToMove && hasProgressiveJumpContinuation(state);

  const selectedPiece = selectedId
    ? pieceById(state.pieces, selectedId)
    : undefined;
  const activePiece = lockedPieceId
    ? pieceById(state.pieces, lockedPieceId)
    : selectedPiece;

  const legalDests: LegalDestination[] = useMemo(() => {
    if (!humanToMove || !activePiece) return [];
    if (state.jumpSequence) return getProgressiveJumpDestinations(state);
    return getLegalDestinationsForPiece(state, activePiece);
  }, [activePiece, state, humanToMove]);

  const legalKeys = useMemo(
    () => new Set(legalDests.map((d) => `${d.to.x},${d.to.y}`)),
    [legalDests],
  );

  const runAnimatedLanding = useCallback(
    async (before: GameState, pieceId: string, to: Square) => {
      if (!alive.current) return before;
      setState(previewPieceMove(before, pieceId, to));
      await sleep(MOVE_MS);
      return before;
    },
    [],
  );

  const commitHumanMove = useCallback(
    async (before: GameState, move: Move & { type: "step" | "jump" }) => {
      if (animLock.current || before.status !== "playing") return;
      const result = tryApplyMove(before, move);
      if (!result.ok) return;

      animLock.current = true;
      setBusy(true);
      setSelectedId(null);
      await runAnimatedLanding(before, move.pieceId, move.to);
      if (!alive.current) return;

      const moved = pieceById(before.pieces, move.pieceId);
      const still = pieceById(result.state.pieces, move.pieceId);
      const royalExited = moved?.kind === "royal" && !still;

      if (royalExited) {
        setState(result.state);
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
      animLock.current = false;
    },
    [runAnimatedLanding],
  );

  const playAiTurnAnimated = useCallback(
    async (before: GameState, turn: AiTurn) => {
      animLock.current = true;
      setBusy(true);
      setThinking(false);

      if (turn.kind === "step") {
        await runAnimatedLanding(before, turn.pieceId, turn.to);
        if (!alive.current) return;
        const next = tryApplyMove(before, {
          type: "step",
          pieceId: turn.pieceId,
          to: turn.to,
        });
        if (next.ok) setState(next.state);
      } else {
        let cursor = before;
        for (const to of turn.landings) {
          await runAnimatedLanding(cursor, turn.pieceId, to);
          if (!alive.current) return;
          const next = tryApplyMove(cursor, {
            type: "jump",
            pieceId: turn.pieceId,
            to,
          });
          if (!next.ok) break;
          cursor = next.state;
          setState(cursor);
          if (!cursor.jumpSequence || cursor.status !== "playing") break;
        }
        if (cursor.jumpSequence && cursor.status === "playing") {
          setState(endJumpTurn(cursor));
        }
      }

      setBusy(false);
      animLock.current = false;
    },
    [runAnimatedLanding],
  );

  // AI turn trigger — runs once whenever it becomes the computer's turn.
  useEffect(() => {
    if (!started) return;
    if (state.status !== "playing") return;
    if (state.turn !== aiSide) return;
    if (animLock.current) return;

    let cancelled = false;
    setThinking(true);

    void (async () => {
      await sleep(250);
      if (cancelled || !alive.current) return;
      try {
        const turn = await requestAiTurn(state, difficulty, aiSide);
        if (cancelled || !alive.current) return;
        if (!turn) {
          setThinking(false);
          return;
        }
        await playAiTurnAnimated(state, turn);
      } catch {
        if (!cancelled && alive.current) setThinking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, state.status, state.turn, state.positionHistory.length, aiSide, difficulty]);

  const onSelectSquare = useCallback(
    (sq: Square) => {
      if (!humanToMove) return;

      if (lockedPieceId) {
        const dest = legalDests.find((d) => d.to.x === sq.x && d.to.y === sq.y);
        if (dest) {
          void commitHumanMove(state, {
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
        const dest = legalDests.find((d) => d.to.x === sq.x && d.to.y === sq.y);
        if (dest) {
          void commitHumanMove(state, {
            type: dest.moveType,
            pieceId: selectedId,
            to: dest.to,
          });
          return;
        }
      }

      if (pieceOnSquare && pieceOnSquare.side === humanSide) {
        setSelectedId(pieceOnSquare.id);
        return;
      }
      setSelectedId(null);
    },
    [
      humanToMove,
      lockedPieceId,
      legalDests,
      state,
      selectedId,
      humanSide,
      commitHumanMove,
    ],
  );

  const onEndJump = () => {
    if (!showJumpPrompt || !state.jumpSequence) return;
    setState(endJumpTurn(state));
    setSelectedId(null);
  };

  const startGame = (side: Side, diff: AiDifficulty) => {
    setHumanSide(side);
    setDifficulty(diff);
    setState(createInitialState());
    setSelectedId(null);
    setBusy(false);
    setThinking(false);
    animLock.current = false;
    setStarted(true);
  };

  const resetToSetup = () => {
    setStarted(false);
    setState(createInitialState());
    setSelectedId(null);
    setBusy(false);
    setThinking(false);
    animLock.current = false;
    setConfirmResign(false);
  };

  const doResign = () => {
    setState(applyMove(state, { type: "resign", side: humanSide }));
    setConfirmResign(false);
  };

  if (!started) {
    return (
      <div className={setupStyles.setupPage}>
        <Link href="/" className={setupStyles.back}>
          ← תפריט
        </Link>
        <h1 className={setupStyles.title}>משחק מול המחשב</h1>
        <p className={setupStyles.lead}>בחרו צד ורמת קושי</p>

        <section className={setupStyles.block}>
          <h2>הצד שלי</h2>
          <div className={setupStyles.row}>
            <button
              type="button"
              className={humanSide === "halcon" ? setupStyles.active : ""}
              onClick={() => setHumanSide("halcon")}
            >
              Halcon (מתחיל)
            </button>
            <button
              type="button"
              className={humanSide === "toro" ? setupStyles.active : ""}
              onClick={() => setHumanSide("toro")}
            >
              Toro
            </button>
          </div>
        </section>

        <section className={setupStyles.block}>
          <h2>רמת קושי</h2>
          <div className={setupStyles.row}>
            {DIFFICULTY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                className={difficulty === d ? setupStyles.active : ""}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          className={setupStyles.start}
          onClick={() => startGame(humanSide, difficulty)}
        >
          התחל משחק
        </button>
      </div>
    );
  }

  const statusText = thinking
    ? "המחשב חושב…"
    : state.turn === humanSide
      ? "התור שלך"
      : "תור המחשב";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          HALCON-TORO
        </Link>
        <div className={styles.turnBadge} data-side={state.turn}>
          {statusText} · {DIFFICULTY_LABEL[difficulty]} · את/ה{" "}
          {sideLabel(humanSide)}
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidePanel} data-side="toro">
          <h2>Toro {aiSide === "toro" ? "(מחשב)" : "(את/ה)"}</h2>
          <p className={styles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, "toro")} / 4
          </p>
          <ExitedRoyals side="toro" colors={state.exitedRoyals.toro} />
        </aside>

        <section className={styles.boardWrap}>
          <Board
            state={state}
            rotated={boardRotated}
            selectedId={lockedPieceId ?? selectedId}
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
          {thinking && (
            <p className={setupStyles.thinking}>
              {difficulty === "master"
                ? "המחשב מנתח לעומק (מאסטר)…"
                : "המחשב מתכנן מהלך…"}
            </p>
          )}
        </section>

        <aside className={styles.sidePanel} data-side="halcon">
          <h2>Halcon {aiSide === "halcon" ? "(מחשב)" : "(את/ה)"}</h2>
          <p className={styles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, "halcon")} / 4
          </p>
          <ExitedRoyals side="halcon" colors={state.exitedRoyals.halcon} />
        </aside>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => setConfirmResign(true)}
          disabled={busy || thinking || state.status !== "playing"}
        >
          כניעה
        </button>
        <button type="button" className={styles.ghost} onClick={resetToSetup}>
          משחק חדש
        </button>
      </footer>

      {confirmResign && (
        <div className={styles.modal}>
          <div className={styles.dialog}>
            <h3>לכנוע?</h3>
            <p>המחשב יוכרז כמנצח.</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={doResign}>
                כן, כניעה
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConfirmResign(false)}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === "ended" && !busy && (
        <div className={styles.modal}>
          <div className={styles.dialog}>
            <h3>סיום המשחק</h3>
            <p>{resultMessage(state, humanSide)}</p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                onClick={() => startGame(humanSide, difficulty)}
              >
                משחק חוזר
              </button>
              <button type="button" className={styles.ghost} onClick={resetToSetup}>
                בחירה מחדש
              </button>
              <Link href="/" className={styles.linkBtn}>
                תפריט
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
