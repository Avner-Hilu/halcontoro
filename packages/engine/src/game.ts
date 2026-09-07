import type {
  GameResult,
  GameState,
  Move,
  Side,
  Square,
} from "./types";
import {
  isInTargetZone,
  oppositeSide,
  squaresEqual,
} from "./types";
import { findDestination, hasAnyLegalMove, hasProgressiveJumpContinuation } from "./moves";
import { cloneState, pieceById, positionHash } from "./utils";
import { createInitialState } from "./setup";

export { createInitialState };
export { positionHash, remainingRoyals, pieceAt, pieceById } from "./utils";
export {
  getAllLegalDestinations,
  getLegalDestinationsForPiece,
  getProgressiveJumpDestinations,
  hasAnyLegalMove,
  hasProgressiveJumpContinuation,
} from "./moves";
export * from "./types";

const ROYALS_TO_WIN = 4;

function endGame(
  state: GameState,
  winner: Side | null,
  reason: GameResult["reason"],
): GameState {
  state.status = "ended";
  state.result = { winner, reason };
  state.jumpSequence = null;
  return state;
}

function switchTurn(state: GameState): GameState {
  state.jumpSequence = null;
  state.turn = oppositeSide(state.turn);
  recordPositionAndCheck(state);
  if (state.status === "ended") return state;

  if (!hasAnyLegalMove(state)) {
    return endGame(state, null, "no_moves");
  }
  return state;
}

function recordPositionAndCheck(state: GameState): void {
  const hash = positionHash(state);
  state.positionHistory.push(hash);
  const count = state.positionHistory.filter((h) => h === hash).length;
  if (count >= 3) {
    endGame(state, null, "threefold");
  }
}

function finishTurnAfterAction(state: GameState): GameState {
  if (state.exitedRoyals[state.turn].length >= ROYALS_TO_WIN) {
    return endGame(state, state.turn, "royals_exited");
  }
  return switchTurn(state);
}

/**
 * Apply a move. Throws if illegal.
 * After a jump that does not exit a royal, leaves jumpSequence active.
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (state.status !== "playing") {
    throw new Error("Game already ended");
  }

  const next = cloneState(state);

  if (move.type === "resign") {
    return endGame(next, oppositeSide(move.side), "resign");
  }

  if (move.type === "agree_draw") {
    return endGame(next, null, "draw_agreed");
  }

  const piece = pieceById(next.pieces, move.pieceId);
  if (!piece) throw new Error("Piece not found");
  if (piece.side !== next.turn) throw new Error("Not your piece");

  if (next.jumpSequence && next.jumpSequence.pieceId !== piece.id) {
    throw new Error("Must continue with the jumping piece");
  }

  const dest = findDestination(next, piece.id, move.to);
  if (!dest) throw new Error("Illegal destination");

  if (move.type === "step") {
    if (dest.moveType !== "step") throw new Error("Not a step destination");
    if (piece.kind === "royal") throw new Error("Royals cannot step");
    piece.position = { ...move.to };
    return finishTurnAfterAction(next);
  }

  if (move.type === "jump") {
    if (dest.moveType !== "jump") throw new Error("Not a jump destination");
    const from = { ...piece.position };
    piece.position = { ...move.to };

    if (piece.kind === "royal" && isInTargetZone(piece.side, piece.position)) {
      next.exitedRoyals[piece.side].push(piece.color);
      next.pieces = next.pieces.filter((p) => p.id !== piece.id);
      return finishTurnAfterAction(next);
    }

    const path = next.jumpSequence
      ? [...next.jumpSequence.path, move.to]
      : [from, move.to];
    next.jumpSequence = { pieceId: piece.id, path };
    return next;
  }

  throw new Error("Unknown move type");
}

/** End the current jump sequence and switch turn. */
export function endJumpTurn(state: GameState): GameState {
  if (state.status !== "playing") {
    throw new Error("Game already ended");
  }
  if (!state.jumpSequence) {
    throw new Error("No jump sequence to end");
  }
  const next = cloneState(state);
  return finishTurnAfterAction(next);
}

export function getResult(state: GameState): GameResult | null {
  return state.result;
}

export function canEndJumpTurn(state: GameState): boolean {
  return state.status === "playing" && state.jumpSequence !== null;
}

/** End jump turn when the only remaining jumps revisit the path. */
export function settleJumpSequence(state: GameState): GameState {
  if (!state.jumpSequence) return state;
  if (hasProgressiveJumpContinuation(state)) return state;
  return endJumpTurn(state);
}

export function tryApplyMove(
  state: GameState,
  move: Move,
): { ok: true; state: GameState } | { ok: false; error: string } {
  try {
    return { ok: true, state: applyMove(state, move) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function isLegalMove(state: GameState, move: Move): boolean {
  return tryApplyMove(state, move).ok;
}

export function square(x: number, y: number): Square {
  return { x, y };
}

export { squaresEqual };
