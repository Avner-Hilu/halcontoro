"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  applyMove,
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
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  abandonRoom,
  createRoom,
  fetchRoomBundle,
  humanizeOnlineError,
  joinRoom,
  mySideForRoom,
  submitGameState,
  subscribeRoom,
  type RoomBundle,
} from "@/lib/online";
import { sideLabel } from "@/lib/pieces";
import boardStyles from "@/components/LocalGame/LocalGame.module.css";
import styles from "./OnlinePlay.module.css";

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

type Phase = "auth" | "lobby" | "waiting" | "playing";

export function OnlinePlay() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<RoomBundle | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      setPhase("auth");
      return;
    }
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setPhase(uid ? "lobby" : "auth");
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setBundle(null);
        setPhase("auth");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!bundle || !userId) return;
    const roomId = bundle.room.id;
    const gameId = bundle.game.id;
    const unsub = subscribeRoom(roomId, gameId, {
      onRoom: (room) => {
        setBundle((prev) => (prev ? { ...prev, room } : prev));
        if (room.status === "playing") setPhase("playing");
        if (room.status === "abandoned") {
          setMessage("היריב עזב את החדר.");
          setPhase("lobby");
          setBundle(null);
        }
      },
      onGame: (game) => {
        setBundle((prev) => {
          if (!prev) return prev;
          if (game.version <= prev.game.version) return prev;
          return { ...prev, game };
        });
      },
      onError: (msg) => setMessage(humanizeOnlineError(msg)),
    });
    return unsub;
  }, [bundle?.room.id, bundle?.game.id, userId]);

  const enterBundle = useCallback((next: RoomBundle) => {
    setBundle(next);
    setMessage(null);
    setPhase(next.room.status === "waiting" ? "waiting" : "playing");
  }, []);

  const onCreate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await createRoom();
      enterBundle(next);
    } catch (e) {
      setMessage(humanizeOnlineError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const next = await joinRoom(joinCode);
      enterBundle(next);
    } catch (err) {
      setMessage(
        humanizeOnlineError(err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setBusy(false);
    }
  };

  const resetToLobby = () => {
    setBundle(null);
    setPhase("lobby");
  };

  const onLeave = async () => {
    if (!bundle) {
      resetToLobby();
      return;
    }
    setBusy(true);
    try {
      if (bundle.room.status === "playing" && userId) {
        const side = mySideForRoom(bundle.room, userId);
        if (side && bundle.game.state.status === "playing") {
          const resigned = applyMove(bundle.game.state, {
            type: "resign",
            side,
          });
          await submitGameState({
            gameId: bundle.game.id,
            roomId: bundle.room.id,
            expectedVersion: bundle.game.version,
            nextState: resigned,
            roomStatus: "finished",
          });
        } else {
          await abandonRoom(bundle.room.id);
        }
      } else {
        await abandonRoom(bundle.room.id);
      }
    } catch {
      // Still leave locally.
    } finally {
      setBusy(false);
      resetToLobby();
    }
  };

  if (!ready) {
    return <p className={styles.muted}>טוען…</p>;
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>משחק אונליין</h1>
          <p className={styles.body}>חיבור למשתמשים עדיין לא הוגדר בסביבה זו.</p>
          <Link href="/" className={styles.link}>
            ← חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "auth" || !userId) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>משחק אונליין</h1>
          <p className={styles.body}>
            יש להתחבר (או להמשיך כאורח) לפני יצירת חדר או הצטרפות.
          </p>
          <Link href="/account" className={styles.primary}>
            להתחברות
          </Link>
          <Link href="/" className={styles.link}>
            ← חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "lobby") {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>משחק אונליין</h1>
          <p className={styles.body}>
            צרו חדר ושתפו את הקוד, או הצטרפו עם קוד מחבר.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={onCreate}
            disabled={busy}
          >
            צרו חדר
          </button>
          <form className={styles.form} onSubmit={onJoin}>
            <label className={styles.label}>
              קוד חדר
              <input
                className={styles.input}
                value={joinCode}
                onChange={(ev) => setJoinCode(ev.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                autoComplete="off"
                dir="ltr"
              />
            </label>
            <button
              type="submit"
              className={styles.secondary}
              disabled={busy || joinCode.trim().length < 6}
            >
              הצטרפו
            </button>
          </form>
          {message && <p className={styles.message}>{message}</p>}
          <Link href="/" className={styles.link}>
            ← חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "waiting" && bundle) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1 className={styles.title}>מחכים ליריב…</h1>
          <p className={styles.body}>שתפו את הקוד:</p>
          <p className={styles.code} dir="ltr">
            {bundle.room.code}
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              void navigator.clipboard?.writeText(bundle.room.code);
              setMessage("הקוד הועתק.");
            }}
          >
            העתיקו קוד
          </button>
          {message && <p className={styles.message}>{message}</p>}
          <button
            type="button"
            className={styles.ghost}
            onClick={onLeave}
            disabled={busy}
          >
            בטלו חדר
          </button>
          <Link href="/" className={styles.link}>
            ← חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (bundle && userId) {
    return (
      <OnlineGame
        bundle={bundle}
        userId={userId}
        onBundle={setBundle}
        onBackToLobby={resetToLobby}
        onLeave={onLeave}
        syncError={message}
        setSyncError={setMessage}
      />
    );
  }

  return null;
}

function OnlineGame({
  bundle,
  userId,
  onBundle,
  onBackToLobby,
  onLeave,
  syncError,
  setSyncError,
}: {
  bundle: RoomBundle;
  userId: string;
  onBundle: (b: RoomBundle | null) => void;
  onBackToLobby: () => void;
  onLeave: () => void;
  syncError: string | null;
  setSyncError: (m: string | null) => void;
}) {
  const mySide = mySideForRoom(bundle.room, userId) ?? "halcon";
  const [state, setState] = useState<GameState>(bundle.game.state);
  const [version, setVersion] = useState(bundle.game.version);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const animTimer = useRef<number | null>(null);
  const versionRef = useRef(version);
  versionRef.current = version;

  useEffect(() => {
    if (animating || pushing) return;
    if (bundle.game.version > version) {
      setState(bundle.game.state);
      setVersion(bundle.game.version);
      setSelectedId(null);
    }
  }, [bundle.game, version, animating, pushing]);

  const boardRotated = mySide === "toro";
  const myTurn = state.status === "playing" && state.turn === mySide;
  const lockedPieceId = state.jumpSequence?.pieceId ?? null;
  const showJumpPrompt =
    myTurn && !animating && hasProgressiveJumpContinuation(state);

  const selectedPiece = selectedId
    ? pieceById(state.pieces, selectedId)
    : undefined;
  const activePiece = lockedPieceId
    ? pieceById(state.pieces, lockedPieceId)
    : selectedPiece;

  const legalDests: LegalDestination[] = useMemo(() => {
    if (!myTurn || animating || !activePiece || state.status !== "playing") {
      return [];
    }
    if (state.jumpSequence) return getProgressiveJumpDestinations(state);
    return getLegalDestinationsForPiece(state, activePiece);
  }, [activePiece, state, animating, myTurn]);

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

  const pushState = useCallback(
    async (nextState: GameState, fromVersion: number) => {
      setPushing(true);
      setSyncError(null);
      try {
        const roomStatus =
          nextState.status === "ended" ? ("finished" as const) : undefined;
        const updated = await submitGameState({
          gameId: bundle.game.id,
          roomId: bundle.room.id,
          expectedVersion: fromVersion,
          nextState,
          roomStatus,
        });
        setState(updated.state);
        setVersion(updated.version);
        onBundle({
          room: {
            ...bundle.room,
            status: roomStatus ?? bundle.room.status,
          },
          game: updated,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSyncError(humanizeOnlineError(msg));
        try {
          const fresh = await fetchRoomBundle(bundle.room.id);
          onBundle(fresh);
          setState(fresh.game.state);
          setVersion(fresh.game.version);
        } catch {
          /* keep local */
        }
      } finally {
        setPushing(false);
      }
    },
    [bundle, onBundle, setSyncError],
  );

  const playMove = useCallback(
    (before: GameState, move: Move & { type: "step" | "jump" }) => {
      if (animating || pushing || before.status !== "playing") return;
      if (before.turn !== mySide) return;
      const result = tryApplyMove(before, move);
      if (!result.ok) return;

      const fromVersion = versionRef.current;
      const moved = pieceById(before.pieces, move.pieceId);
      const stillOnBoard = pieceById(result.state.pieces, move.pieceId);
      const royalExited = moved?.kind === "royal" && !stillOnBoard;

      setAnimating(true);
      setSelectedId(null);
      setState(previewPieceMove(before, move.pieceId, move.to));

      clearAnimTimer();
      animTimer.current = window.setTimeout(() => {
        let commit = result.state;
        if (!royalExited && move.type === "jump") {
          if (hasProgressiveJumpContinuation(result.state)) {
            commit = result.state;
            setSelectedId(move.pieceId);
          } else {
            commit = settleJumpSequence(result.state);
            setSelectedId(null);
          }
        } else {
          setSelectedId(null);
        }
        setState(commit);
        setAnimating(false);
        animTimer.current = null;
        void pushState(commit, fromVersion);
      }, MOVE_MS);
    },
    [animating, pushing, mySide, pushState],
  );

  const onSelectSquare = useCallback(
    (sq: Square) => {
      if (!myTurn || animating || pushing || state.status !== "playing") return;

      if (lockedPieceId) {
        const dest = legalDests.find((d) => d.to.x === sq.x && d.to.y === sq.y);
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
        const dest = legalDests.find((d) => d.to.x === sq.x && d.to.y === sq.y);
        if (dest) {
          playMove(state, {
            type: dest.moveType,
            pieceId: selectedId,
            to: dest.to,
          });
          return;
        }
      }

      if (pieceOnSquare && pieceOnSquare.side === mySide) {
        setSelectedId(pieceOnSquare.id);
        return;
      }

      setSelectedId(null);
    },
    [
      state,
      selectedId,
      legalDests,
      lockedPieceId,
      animating,
      pushing,
      myTurn,
      mySide,
      playMove,
    ],
  );

  const onEndJump = () => {
    if (!myTurn || animating || pushing || !state.jumpSequence) return;
    const fromVersion = versionRef.current;
    setAnimating(true);
    clearAnimTimer();
    animTimer.current = window.setTimeout(() => {
      const next = endJumpTurn(state);
      setState(next);
      setSelectedId(null);
      setAnimating(false);
      animTimer.current = null;
      void pushState(next, fromVersion);
    }, 120);
  };

  const doResign = () => {
    if (animating || pushing || state.status !== "playing") return;
    const fromVersion = versionRef.current;
    const next = applyMove(state, { type: "resign", side: mySide });
    setConfirmResign(false);
    setSelectedId(null);
    setState(next);
    void pushState(next, fromVersion);
  };

  const activeSelected = lockedPieceId ?? selectedId ?? null;
  const opponent: Side = mySide === "halcon" ? "toro" : "halcon";

  return (
    <div className={boardStyles.page}>
      <header className={boardStyles.header}>
        <Link href="/" className={boardStyles.brand}>
          HALCON-TORO
        </Link>
        <div className={styles.meta}>
          <span className={styles.codeChip} dir="ltr">
            {bundle.room.code}
          </span>
          <div className={boardStyles.turnBadge} data-side={state.turn}>
            {myTurn ? "התור שלכם" : `תור: ${sideLabel(state.turn)}`}
          </div>
        </div>
      </header>

      <div className={boardStyles.layout}>
        <aside className={boardStyles.sidePanel} data-side={opponent}>
          <h2>{sideLabel(opponent)}</h2>
          <p className={boardStyles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, opponent)} / 4
          </p>
          <ExitedRoyals side={opponent} colors={state.exitedRoyals[opponent]} />
        </aside>

        <section className={boardStyles.boardWrap}>
          <Board
            state={state}
            rotated={boardRotated}
            selectedId={activeSelected}
            legalKeys={legalKeys}
            onSelectSquare={onSelectSquare}
          />

          {showJumpPrompt && (
            <div className={boardStyles.jumpBar}>
              <span>רצף קפיצות — ניתן להמשיך או לסיים</span>
              <button
                type="button"
                onClick={onEndJump}
                disabled={animating || pushing}
              >
                סיום תור
              </button>
            </div>
          )}
        </section>

        <aside className={boardStyles.sidePanel} data-side={mySide}>
          <h2>{sideLabel(mySide)} (אתם)</h2>
          <p className={boardStyles.counter}>
            מלכותיים על הלוח: {remainingRoyals(state, mySide)} / 4
          </p>
          <ExitedRoyals side={mySide} colors={state.exitedRoyals[mySide]} />
        </aside>
      </div>

      <footer className={boardStyles.footer}>
        <button
          type="button"
          onClick={() => setConfirmResign(true)}
          disabled={animating || pushing || state.status !== "playing"}
        >
          כניעה
        </button>
        <button
          type="button"
          className={boardStyles.ghost}
          onClick={onLeave}
          disabled={animating || pushing}
        >
          עזבו חדר
        </button>
      </footer>

      {syncError && <p className={styles.syncError}>{syncError}</p>}

      {confirmResign && (
        <div className={boardStyles.modal}>
          <div className={boardStyles.dialog}>
            <h3>כניעה?</h3>
            <p>היריב ינצח מיד.</p>
            <div className={boardStyles.dialogActions}>
              <button type="button" onClick={doResign}>
                אישור כניעה
              </button>
              <button
                type="button"
                className={boardStyles.ghost}
                onClick={() => setConfirmResign(false)}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === "ended" && !animating && (
        <div className={boardStyles.modal}>
          <div className={boardStyles.dialog}>
            <h3>סיום המשחק</h3>
            <p>{resultMessage(state)}</p>
            <div className={boardStyles.dialogActions}>
              <button type="button" onClick={onBackToLobby}>
                חזרה ללובי
              </button>
              <Link href="/" className={boardStyles.linkBtn}>
                חזרה לתפריט
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
